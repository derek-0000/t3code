import { resolveDraftHeroState } from "../components/ChatView.logic";
import { describe, expect, it } from "vite-plus/test";
import { type CustomBackgroundRecord, defaultCustomBackgroundFilter } from "@t3tools/contracts";

import {
  backgroundIsRenderable,
  createGenerativeBackground,
  filtersEqual,
  nextActiveAfterRemove,
  removeBackground,
  resolveDisplayedBackground,
  nextNewBackgroundName,
  upsertBackground,
  withFilterKind,
} from "./records";

const imageId = "a".repeat(64);
const createdAt = "2026-09-08T00:00:00.000Z";
const sunset: CustomBackgroundRecord = {
  id: "bg-1",
  name: "Sunset",
  source: { kind: "image", imageId },
  filter: defaultCustomBackgroundFilter("image-dithering"),
  fade: 100,
  createdAt,
};
const mesh = createGenerativeBackground({
  id: "bg-2",
  name: "Mesh",
  filter: defaultCustomBackgroundFilter("static-mesh-gradient"),
  createdAt,
});

describe("nextNewBackgroundName", () => {
  it("numbers from 1 and skips names already in the library", () => {
    expect(nextNewBackgroundName([])).toBe("New Background 1");
    expect(nextNewBackgroundName([sunset])).toBe("New Background 1");
    expect(
      nextNewBackgroundName([
        { ...sunset, name: "New Background 1" },
        { ...mesh, name: "New Background 3" },
      ]),
    ).toBe("New Background 2");
  });
});

describe("library edits", () => {
  it("upserts by id and keeps order", () => {
    const library = upsertBackground([sunset, mesh], { ...sunset, name: "Dusk" });
    expect(library.map((record) => record.name)).toEqual(["Dusk", "Mesh"]);
    expect(upsertBackground([sunset], mesh)).toEqual([sunset, mesh]);
  });

  it("removes and clears the active pointer only when it was the removed one", () => {
    expect(removeBackground([sunset, mesh], "bg-1")).toEqual([mesh]);
    expect(nextActiveAfterRemove("bg-1", "bg-1")).toBeNull();
    expect(nextActiveAfterRemove("bg-2", "bg-1")).toBe("bg-2");
  });

  it("resets parameters when the filter kind changes and keeps the image", () => {
    const glass = withFilterKind(sunset, "fluted-glass");
    expect(glass.filter.kind).toBe("fluted-glass");
    expect(glass.source).toEqual(sunset.source);
    expect(withFilterKind(glass, "fluted-glass")).toBe(glass);
    const gradient = withFilterKind(glass, "grain-gradient");
    expect(gradient.source).toEqual(sunset.source);
  });
});

describe("images", () => {
  it("only renders records that have what their filter needs", () => {
    expect(backgroundIsRenderable(sunset)).toBe(true);
    expect(backgroundIsRenderable(mesh)).toBe(true);
    expect(backgroundIsRenderable({ ...sunset, source: { kind: "none" } })).toBe(false);
  });
});

describe("filtersEqual", () => {
  it("compares parameters including color lists", () => {
    const a = defaultCustomBackgroundFilter("grain-gradient");
    expect(filtersEqual(a, defaultCustomBackgroundFilter("grain-gradient"))).toBe(true);
    if (a.kind !== "grain-gradient") throw new Error("unexpected kind");
    expect(filtersEqual(a, { ...a, colors: a.colors.toReversed() })).toBe(false);
    expect(filtersEqual(a, { ...a, noise: a.noise + 0.01 })).toBe(false);
    expect(filtersEqual(a, defaultCustomBackgroundFilter("image-dithering"))).toBe(false);
  });
});

describe("live app background", () => {
  const options = {
    selected: sunset,
    preview: null,
    enabled: true,
    editing: false,
    routeKind: "other" as const,
    inConversations: false,
  };

  it("previews slider changes only on routes where backgrounds are enabled", () => {
    const preview = { ...sunset, fade: 25 };
    expect(resolveDisplayedBackground(options)).toBeNull();
    expect(resolveDisplayedBackground({ ...options, editing: true, preview })).toBeNull();
    expect(
      resolveDisplayedBackground({ ...options, editing: true, preview, routeKind: "draft" }),
    ).toBe(preview);
    expect(
      resolveDisplayedBackground({
        ...options,
        editing: true,
        preview,
        routeKind: "conversation",
        inConversations: true,
      }),
    ).toBe(preview);
    const saved = { ...options, selected: preview, preview, editing: false };
    expect(resolveDisplayedBackground(saved)).toBeNull();
    expect(resolveDisplayedBackground({ ...saved, routeKind: "draft" })).toBe(preview);
    expect(
      resolveDisplayedBackground({
        ...saved,
        routeKind: "conversation",
        inConversations: true,
      }),
    ).toBe(preview);
  });

  it("hides drafts and editor previews when disabled", () => {
    const state = {
      ...options,
      routeKind: "draft" as const,
      editing: true,
      preview: { ...sunset, fade: 25 },
    };
    expect(resolveDisplayedBackground({ ...state, enabled: false })).toBeNull();
    expect(resolveDisplayedBackground(state)).toBe(state.preview);
  });

  it("does not paint another background's pending changes after changing selection", () => {
    expect(
      resolveDisplayedBackground({
        ...options,
        routeKind: "draft",
        editing: true,
        selected: mesh,
        preview: sunset,
      }),
    ).toBe(mesh);
    expect(
      resolveDisplayedBackground({
        ...options,
        routeKind: "draft",
        editing: true,
        selected: null,
        preview: sunset,
      }),
    ).toBeNull();
  });
});

describe("background visibility during first submission", () => {
  it.each([
    { hasTimelineEntries: false, isWorking: false, draftHeroDockRequested: false, visible: true },
    { hasTimelineEntries: false, isWorking: false, draftHeroDockRequested: true, visible: false },
    { hasTimelineEntries: true, isWorking: false, draftHeroDockRequested: false, visible: false },
    { hasTimelineEntries: true, isWorking: true, draftHeroDockRequested: false, visible: false },
  ])("respects the empty chat state: %j", ({ visible, ...state }) => {
    const isDraftHeroState = resolveDraftHeroState({
      ...state,
      isLocalDraftThread: true,
      backgroundSubmissionPending: false,
    });
    for (const inConversations of [false, true]) {
      expect(
        resolveDisplayedBackground({
          selected: sunset,
          preview: null,
          enabled: true,
          editing: false,
          routeKind: isDraftHeroState ? "draft" : "conversation",
          inConversations,
        }),
      ).toBe(visible || inConversations ? sunset : null);
    }
  });
});
