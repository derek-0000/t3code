import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("~/lib/imageCompression", () => ({
  reencodeImage: vi.fn(async () => ({
    ok: true,
    image: { blob: new Blob(["encoded"], { type: "image/webp" }), width: 20, height: 10 },
  })),
}));

// Only the IndexedDB boundary is simulated; exercise the real store, URL cache,
// subscriptions, hashing, and upload path.
function imageDatabase() {
  const images = new Map<string, unknown>();
  let failReads = false;
  const database = Object.assign(new EventTarget(), {
    transaction: () => {
      const transaction = Object.assign(new EventTarget(), {
        objectStore: () => ({
          get: (id: string) => {
            const request = Object.assign(new EventTarget(), {
              result: images.get(id),
              error: new Error("Read unavailable"),
            });
            queueMicrotask(() => request.dispatchEvent(new Event(failReads ? "error" : "success")));
            return request;
          },
          put: (image: { id: string }) => {
            images.set(image.id, image);
            queueMicrotask(() => transaction.dispatchEvent(new Event("complete")));
          },
          delete: (id: string) => {
            images.delete(id);
            queueMicrotask(() => transaction.dispatchEvent(new Event("complete")));
          },
        }),
      });
      return transaction;
    },
  });
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = Object.assign(new EventTarget(), { result: database });
      queueMicrotask(() => request.dispatchEvent(new Event("success")));
      return request;
    },
  });
  return {
    failReads: (value: boolean) => {
      failReads = value;
    },
  };
}

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it.each(["deleted", "read failure"])(
  "recovers both mounted image URLs after %s and re-upload",
  async (failure) => {
    const database = imageDatabase();
    const store = await import("./imageStore");
    const file = new File(["photo"], "photo.png", { type: "image/png" });
    const first = await store.storeBackgroundImage(file);
    if (!first.ok) throw new Error("Initial upload failed");
    const id = first.image.id;
    if (failure === "deleted") await store.deleteBackgroundImage(id);
    else database.failReads(true);

    let full: string | null | false = null;
    let thumbnail: string | null | false = null;
    function Images() {
      full = store.useBackgroundImageUrl(id);
      thumbnail = store.useBackgroundImageUrl(id, "thumbnail");
      return null;
    }
    await act(async () => {
      renderer = create(<Images />);
    });
    expect(full).toBe(false);
    expect(thumbnail).toBe(false);
    database.failReads(false);

    await act(async () => {
      const restored = await store.storeBackgroundImage(file);
      expect(restored.ok && restored.existed).toBe(failure === "read failure");
    });
    expect(full).toEqual(expect.stringMatching(/^blob:/));
    expect(thumbnail).toEqual(expect.stringMatching(/^blob:/));
    expect(await (await fetch(String(full))).text()).toBe("encoded");
    expect(await (await fetch(String(thumbnail))).text()).toBe("encoded");
  },
);
