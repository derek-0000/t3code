import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ClientSettingsPatch,
  type CustomBackgroundRecord,
  defaultCustomBackgroundFilter,
} from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  settings: null as ClientSettings | null,
  listeners: new Set<() => void>(),
  upload: vi.fn(),
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
    useUpdateClientSettings: () => update,
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
vi.mock("~/customBackground/imageStore", () => ({ storeBackgroundImage: state.upload }));
vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { confirm: async () => true } }),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/switch", () => ({ Switch: "switch" }));
vi.mock("../ui/menu", () => ({ Menu: "menu", MenuPopup: "popup", MenuTrigger: "trigger" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "scroll-area" }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "tooltip",
  TooltipPopup: "popup",
  TooltipTrigger: "trigger",
}));
vi.mock("../ui/select", () => ({
  Select: "select",
  SelectItem: "option",
  SelectPopup: "popup",
  SelectTrigger: "trigger",
  SelectValue: "value",
  selectTriggerVariants: () => "",
}));
vi.mock("./BackgroundControls", () => ({
  BackgroundControls: () => null,
  RangeControl: () => null,
}));
vi.mock("./BackgroundImagePicker", () => ({
  BackgroundImagePicker: () => null,
  BackgroundThumbnail: () => null,
  backgroundPickerDeleteButtonClass: "",
  backgroundPickerMenuGridClass: "",
  backgroundPickerTileClass: () => "",
  backgroundStudioFieldClass: () => "",
}));

import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { BackgroundStudioPanel } from "./BackgroundStudioPanel";
import { BackgroundImagePicker } from "./BackgroundImagePicker";
import { RangeControl } from "./BackgroundControls";

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
let renderer: ReactTestRenderer;
let finishUpload: () => void;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", new EventTarget());
  vi.useFakeTimers();
  state.settings = {
    ...DEFAULT_CLIENT_SETTINGS,
    customBackgrounds: [original, other],
    activeCustomBackgroundId: original.id,
  };
  useBackgroundStudioStore.setState({ preview: null });
  const upload = new Promise<{ ok: true; image: { id: string } }>((resolve) => {
    finishUpload = () => resolve({ ok: true, image: { id: uploadedId } });
  });
  state.upload.mockReset().mockReturnValue(upload);
  await act(async () => {
    renderer = create(<BackgroundStudioPanel onClose={() => undefined} />);
  });
  act(() =>
    renderer.root
      .findByType(BackgroundImagePicker)
      .props.onUpload(new File(["photo"], "photo.png")),
  );
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("preserves both persisted and pending edits when encoding finishes", async () => {
  act(() => {
    renderer.root
      .findByProps({ "aria-label": "Background name" })
      .props.onChange({ currentTarget: { value: "Renamed" } });
  });
  act(() => renderer.root.findByProps({ "aria-label": "Background name" }).props.onBlur());
  act(() => vi.advanceTimersByTime(150));
  act(() => renderer.root.findByType(RangeControl).props.onChange(35));
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds[0]).toEqual({
    ...original,
    name: "Renamed",
    fade: 35,
    source: { kind: "image", imageId: uploadedId },
  });
});

it("does not resurrect a background deleted during encoding", async () => {
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Delete background First" }).props.onClick(),
  );
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds).toEqual([other]);
  expect(state.settings?.activeCustomBackgroundId).toBeNull();
});

it("keeps pending changes and selection on another background", async () => {
  act(() => renderer.root.findByProps({ "aria-label": "Second, No filter" }).props.onClick());
  act(() => renderer.root.findByType(RangeControl).props.onChange(20));
  await act(async () => finishUpload());
  expect(state.settings?.activeCustomBackgroundId).toBe(other.id);
  expect(state.settings?.customBackgrounds).toEqual([
    { ...original, source: { kind: "image", imageId: uploadedId } },
    { ...other, fade: 20 },
  ]);
});

it("keeps a newer image choice made while encoding", async () => {
  const chosenId = "c".repeat(64);
  act(() => renderer.root.findByType(BackgroundImagePicker).props.onSelect(chosenId));
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds[0]?.source).toEqual({
    kind: "image",
    imageId: chosenId,
  });
});

it("does not change the library after closing during encoding", async () => {
  await act(async () => renderer.unmount());
  await act(async () => finishUpload());
  expect(state.settings?.customBackgrounds).toEqual([original, other]);
});
