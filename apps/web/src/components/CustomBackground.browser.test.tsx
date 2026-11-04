import {
  DEFAULT_CLIENT_SETTINGS,
  defaultCustomBackgroundFilter,
  type CustomBackgroundRecord,
} from "@t3tools/contracts";
import { render } from "../../test/render";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ selected: null as CustomBackgroundRecord | null }));
vi.mock("~/customBackground/useActiveBackground", () => ({
  useActiveBackground: () => state.selected,
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
}));
vi.mock("~/customBackground/backgroundStudioStore", () => ({
  useBackgroundStudioStore: (select: (store: { open: boolean; preview: null }) => unknown) =>
    select({ open: false, preview: null }),
}));
vi.mock("~/customBackground/imageStore", () => ({ useBackgroundImageUrl: () => false }));
vi.mock("~/customBackground/webgl", () => ({ isWebGlAvailable: () => true }));
vi.mock("./background/BackgroundRenderer", () => ({
  BackgroundRenderer: () => <div>Rendered background</div>,
}));
import { CustomBackground } from "./CustomBackground";

it("renders gradients with a missing retained photo and hides image filters until it returns", async () => {
  const record: CustomBackgroundRecord = {
    id: "background",
    name: "Photo",
    createdAt: "2026-09-11",
    fade: 100,
    source: { kind: "image", imageId: "a".repeat(64) },
    filter: defaultCustomBackgroundFilter("image-dithering"),
  };
  state.selected = record;
  await using screen = await render(<CustomBackground routeKind="draft" />, { router: false });
  expect(screen.container.textContent).toBe("");
  for (const kind of ["static-mesh-gradient", "grain-gradient", "none"] as const) {
    state.selected = { ...record, filter: defaultCustomBackgroundFilter(kind) };
    await screen.rerender(<CustomBackground key={kind} routeKind="draft" />);
    if (kind === "none") expect(screen.container.textContent).toBe("");
    else await expect.element(screen.getByText("Rendered background")).toBeInTheDocument();
  }
});
