import { sha256 } from "@noble/hashes/sha2";
import type { CustomBackgroundImageId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { type ImageCompressionFailureReason, reencodeImage } from "~/lib/imageCompression";

const DATABASE_NAME = "t3code:custom-backgrounds";
const DATABASE_VERSION = 1;
const IMAGES_STORE = "images";

export const CUSTOM_BACKGROUND_IMAGE_MAX_DIMENSION = 2048;
export const CUSTOM_BACKGROUND_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const THUMBNAIL_MAX_DIMENSION = 256;
const THUMBNAIL_MAX_BYTES = 200 * 1024;

export const CUSTOM_BACKGROUND_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface StoredBackgroundImage {
  readonly id: CustomBackgroundImageId;
  readonly blob: Blob;
  readonly thumbnail: Blob;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly createdAt: string;
}

export type StoreBackgroundImageResult =
  | { ok: true; image: StoredBackgroundImage; existed: boolean }
  | { ok: false; reason: ImageCompressionFailureReason | "quota" | "unavailable" };

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is unavailable in this browser context."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(IMAGES_STORE)) {
        request.result.createObjectStore(IMAGES_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Could not open the background image store."));
    });
    request.addEventListener("success", () => {
      const database = request.result;
      // A version bump from another tab closes this connection; drop the
      // cache so the next call reopens instead of failing forever.
      database.addEventListener("versionchange", () => {
        database.close();
        databasePromise = null;
      });
      resolve(database);
    });
  });
  databasePromise.catch(() => {
    databasePromise = null;
  });
  return databasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB error")));
    request.addEventListener("success", () => resolve(request.result));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction error")),
    );
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
    );
    transaction.addEventListener("complete", () => resolve());
  });
}

function isStoredBackgroundImage(value: unknown): value is StoredBackgroundImage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.blob instanceof Blob &&
    candidate.thumbnail instanceof Blob &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    typeof candidate.byteLength === "number" &&
    typeof candidate.createdAt === "string"
  );
}

async function readImage(id: CustomBackgroundImageId): Promise<StoredBackgroundImage | null> {
  const database = await openDatabase();
  const value = await requestToPromise(
    database.transaction(IMAGES_STORE, "readonly").objectStore(IMAGES_STORE).get(id),
  );
  return isStoredBackgroundImage(value) ? value : null;
}

async function writeImage(image: StoredBackgroundImage): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(IMAGES_STORE, "readwrite");
  transaction.objectStore(IMAGES_STORE).put(image);
  await transactionDone(transaction);
}

export async function listBackgroundImages(): Promise<ReadonlyArray<StoredBackgroundImage>> {
  if (!hasIndexedDb()) return [];
  const database = await openDatabase();
  const values = await requestToPromise(
    database.transaction(IMAGES_STORE, "readonly").objectStore(IMAGES_STORE).getAll(),
  );
  return values
    .filter(isStoredBackgroundImage)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function deleteBackgroundImage(id: CustomBackgroundImageId): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(IMAGES_STORE, "readwrite");
  transaction.objectStore(IMAGES_STORE).delete(id);
  await transactionDone(transaction);
  releaseUrl(id, "full");
  releaseUrl(id, "thumbnail");
  emitUrlChange();
  emitStoreChange();
}

async function hashBackgroundImageFile(file: Blob): Promise<CustomBackgroundImageId> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return [...sha256(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

let persistenceRequested = false;

function requestPersistentStorage(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
  void navigator.storage.persist().catch(() => undefined);
}

export async function storeBackgroundImage(file: File): Promise<StoreBackgroundImageResult> {
  if (!hasIndexedDb()) return { ok: false, reason: "unavailable" };
  const id = await hashBackgroundImageFile(file);
  try {
    const existing = await readImage(id);
    if (existing) {
      refreshImageUrls(existing);
      return { ok: true, image: existing, existed: true };
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const full = await reencodeImage(file, {
    maxDimension: CUSTOM_BACKGROUND_IMAGE_MAX_DIMENSION,
    maxBytes: CUSTOM_BACKGROUND_IMAGE_MAX_BYTES,
  });
  if (!full.ok) return full;
  const thumbnail = await reencodeImage(file, {
    maxDimension: THUMBNAIL_MAX_DIMENSION,
    maxBytes: THUMBNAIL_MAX_BYTES,
  });
  if (!thumbnail.ok) return thumbnail;

  const image: StoredBackgroundImage = {
    id,
    blob: full.image.blob,
    thumbnail: thumbnail.image.blob,
    width: full.image.width,
    height: full.image.height,
    byteLength: full.image.blob.size,
    createdAt: new Date().toISOString(),
  };
  try {
    await writeImage(image);
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? "quota" : "unavailable" };
  }
  requestPersistentStorage();
  refreshImageUrls(image);
  emitStoreChange();
  return { ok: true, image, existed: false };
}

type UrlVariant = "full" | "thumbnail";
type UrlState = { status: "loading" } | { status: "ready"; url: string } | { status: "missing" };

const urlStates = new Map<string, UrlState>();
// URL resolutions and store writes notify different consumers: a resolved
// thumbnail should not make every image list refetch.
const urlListeners = new Set<() => void>();
const storeListeners = new Set<() => void>();

function urlKey(id: CustomBackgroundImageId, variant: UrlVariant): string {
  return `${variant}:${id}`;
}

function emitUrlChange(): void {
  for (const listener of urlListeners) listener();
}

function emitStoreChange(): void {
  for (const listener of storeListeners) listener();
}

function releaseUrl(id: CustomBackgroundImageId, variant: UrlVariant): void {
  const key = urlKey(id, variant);
  const state = urlStates.get(key);
  if (state?.status === "ready") URL.revokeObjectURL(state.url);
  urlStates.delete(key);
}

// Repair missing or in-flight lookups after a successful upload, including a
// deduplicated upload following a transient read failure. Keep healthy URLs stable.
function refreshImageUrls(image: StoredBackgroundImage): void {
  for (const variant of ["full", "thumbnail"] as const) {
    const key = urlKey(image.id, variant);
    const state = urlStates.get(key);
    if (!state || state.status === "ready") continue;
    urlStates.set(key, {
      status: "ready",
      url: URL.createObjectURL(variant === "full" ? image.blob : image.thumbnail),
    });
  }
  emitUrlChange();
}

function subscribeUrls(listener: () => void): () => void {
  urlListeners.add(listener);
  return () => {
    urlListeners.delete(listener);
  };
}

function ensureUrl(id: CustomBackgroundImageId, variant: UrlVariant): UrlState {
  const key = urlKey(id, variant);
  const cached = urlStates.get(key);
  if (cached) return cached;
  const loading: UrlState = { status: "loading" };
  urlStates.set(key, loading);
  void readImage(id)
    .then((image) => {
      // A delete that raced the read already cleared the slot; leave it.
      if (urlStates.get(key) !== loading) return;
      urlStates.set(
        key,
        image
          ? {
              status: "ready",
              url: URL.createObjectURL(variant === "full" ? image.blob : image.thumbnail),
            }
          : { status: "missing" },
      );
    })
    .catch(() => {
      if (urlStates.get(key) === loading) urlStates.set(key, { status: "missing" });
    })
    .finally(emitUrlChange);
  return loading;
}

/** Resolves an image id to an object URL; `null` while loading, `false` when the image is gone. */
export function useBackgroundImageUrl(
  id: CustomBackgroundImageId | null,
  variant: UrlVariant = "full",
): string | null | false {
  return useSyncExternalStore(
    subscribeUrls,
    () => {
      if (id === null) return false;
      const state = ensureUrl(id, variant);
      return state.status === "ready" ? state.url : state.status === "missing" ? false : null;
    },
    () => null,
  );
}

export function subscribeBackgroundImages(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}
