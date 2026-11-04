import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ClientSettingsPatch,
  type CustomBackgroundRecord,
  defaultCustomBackgroundFilter,
} from "@t3tools/contracts";
import { act, render } from "../../../test/render";
import { page, userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  settings: null as ClientSettings | null,
  listeners: new Set<() => void>(),
  upload: vi.fn(),
  filtersAvailable: true,
}));
vi.mock("~/hooks/useSettings", async () => {
  const { useSyncExternalStore } = await import("react");
  const getClientSettings = () => {
    if (!state.settings) throw new Error("Settings not initialized");
    return state.settings;
  };
  const update = (patch: ClientSettingsPatch) => {
    state.settings = { ...getClientSettings(), ...patch };
    state.listeners.forEach((listener) => listener());
  };
  return {
    getClientSettings,
    useUpdateEnvironmentSettings: () => update,
    useClientSettings: (select: (settings: ClientSettings) => unknown) =>
      select(
        useSyncExternalStore((listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        }, getClientSettings),
      ),
  };
});
vi.mock("~/customBackground/imageStore", () => ({
  storeBackgroundImage: state.upload,
  deleteBackgroundImage: async () => {},
  useBackgroundImageUrl: () => null,
  listBackgroundImages: async () => [],
  subscribeBackgroundImages: () => () => undefined,
  CUSTOM_BACKGROUND_ACCEPTED_TYPES: ["image/png"],
}));
vi.mock("~/customBackground/webgl", () => ({
  isWebGlAvailable: () => state.filtersAvailable,
}));
vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { confirm: async () => true } }),
}));
import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { BackgroundStudioPanel } from "./BackgroundStudioPanel";

const original: CustomBackgroundRecord = {
  id: "first",
  name: "First",
  createdAt: "2026-09-11",
  fade: 100,
  source: { kind: "none" },
  filter: defaultCustomBackgroundFilter("none"),
};
const other = { ...original, id: "second", name: "Second" };
const uploadedId = "b".repeat(64);
function prepareSettings() {
  state.filtersAvailable = true;
  state.settings = {
    ...DEFAULT_CLIENT_SETTINGS,
    customBackgrounds: [original, other],
    activeCustomBackgroundId: original.id,
  };
  useBackgroundStudioStore.setState({ preview: null });
  let finishUpload = () => {};
  const upload = new Promise<{ ok: true; image: { id: string } }>((resolve) => {
    finishUpload = () => resolve({ ok: true, image: { id: uploadedId } });
  });
  state.upload.mockReset().mockReturnValue(upload);
  return finishUpload;
}

async function startUpload(screen: Awaited<ReturnType<typeof render>>) {
  await userEvent.upload(
    screen.getByLabelText("Background image file"),
    new File(["photo"], "photo.png", { type: "image/png" }),
  );
}

it("preserves pending edits when encoding finishes", async () => {
  const finishUpload = prepareSettings();
  await using screen = await render(<BackgroundStudioPanel onClose={() => undefined} />);
  await startUpload(screen);
  await screen.getByLabelText("Background name").fill("Renamed");
  await screen.getByRole("heading", { name: "Customize background" }).click();
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds[0]).toEqual({
    ...original,
    name: "Renamed",
    source: { kind: "image", imageId: uploadedId },
  });
});

it("does not resurrect a background deleted during encoding", async () => {
  const finishUpload = prepareSettings();
  await using screen = await render(<BackgroundStudioPanel onClose={() => undefined} />);
  await startUpload(screen);
  await screen.getByRole("button", { name: /Background: First/ }).click();
  await page.getByRole("button", { name: "Delete background First" }).click();
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds).toEqual([other]);
  expect(state.settings?.activeCustomBackgroundId).toBeNull();
});

it("keeps edits and selection on another background", async () => {
  const finishUpload = prepareSettings();
  await using screen = await render(<BackgroundStudioPanel onClose={() => undefined} />);
  await startUpload(screen);
  await screen.getByRole("button", { name: /Background: First/ }).click();
  await page.getByRole("button", { name: "Second, No filter" }).click();
  await screen.getByLabelText("Background name").fill("Edited second");
  await screen.getByRole("heading", { name: "Customize background" }).click();
  await act(async () => finishUpload());
  expect(state.settings?.activeCustomBackgroundId).toBe(other.id);
  expect(state.settings?.customBackgrounds).toEqual([
    { ...original, source: { kind: "image", imageId: uploadedId } },
    { ...other, name: "Edited second" },
  ]);
});

it("does not change the library after closing during encoding", async () => {
  const finishUpload = prepareSettings();
  await using screen = await render(<BackgroundStudioPanel onClose={() => undefined} />);
  await startUpload(screen);
  await screen.unmount();
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds).toEqual([original, other]);
});

it("disables the filter selector and explains when WebGL is missing", async () => {
  prepareSettings();
  state.filtersAvailable = false;
  await using screen = await render(<BackgroundStudioPanel onClose={() => undefined} />);
  await expect.element(screen.getByText("Filters need WebGL to be active.")).toBeInTheDocument();
  await expect.element(screen.getByRole("combobox")).toBeDisabled();
});
