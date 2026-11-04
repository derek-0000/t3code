import { act, render, stubGlobal } from "../../test/render";
import { expect, it, vi } from "vite-plus/test";

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
  const stub = stubGlobal("indexedDB", {
    open: () => {
      const request = Object.assign(new EventTarget(), { result: database });
      queueMicrotask(() => request.dispatchEvent(new Event("success")));
      return request;
    },
  });
  return {
    [Symbol.dispose]: () => stub[Symbol.dispose](),
    failReads: (value: boolean) => {
      failReads = value;
    },
  };
}

it("recovers both mounted image URLs after deletion or read failure and re-upload", async () => {
  using database = imageDatabase();
  const store = await import("./imageStore");
  for (const failure of ["deleted", "read failure"]) {
    const file = new File([`photo ${failure}`], "photo.png", { type: "image/png" });
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
    await using _screen = await render(<Images />, { router: false });
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
  }
});
