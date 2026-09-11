import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import {
  backgroundStudioChatPath,
  backgroundStudioNavAction,
  isBackgroundStudioDismissPath,
} from "./backgroundStudioNavigation";

function createTestRouter(initialEntry: string) {
  const root = createRootRoute();
  const chat = createRoute({ getParentRoute: () => root, id: "_chat" });
  const index = createRoute({ getParentRoute: () => chat, path: "/" });
  const draft = createRoute({ getParentRoute: () => chat, path: "draft/$draftId" });
  const thread = createRoute({ getParentRoute: () => chat, path: "$environmentId/$threadId" });
  const pullRequests = createRoute({ getParentRoute: () => chat, path: "pull-requests" });
  const settings = createRoute({ getParentRoute: () => root, path: "settings/general" });
  return createRouter({
    routeTree: root.addChildren([chat.addChildren([index, draft, thread, pullRequests]), settings]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

describe("background controller return navigation", () => {
  it("uses the normal landing flow when opened directly in Settings", async () => {
    const router = createTestRouter("/settings/general");
    await router.load();
    expect(backgroundStudioChatPath(router.state.matches) ?? "/").toBe("/");
  });
});

describe("background controller dismiss paths", () => {
  it.each(["/settings", "/settings/appearance", "/usage", "/pull-requests"])(
    "treats %s as a non-chat surface",
    (pathname) => {
      expect(isBackgroundStudioDismissPath(pathname)).toBe(true);
    },
  );

  it.each(["/", "/draft/existing-draft", "/environment-one/thread-one"])(
    "keeps the controller on %s",
    (pathname) => {
      expect(isBackgroundStudioDismissPath(pathname)).toBe(false);
    },
  );

  it("returns to chat when opened from Settings, Usage, or Pull requests", () => {
    for (const pathname of ["/settings/appearance", "/usage", "/pull-requests"]) {
      expect(
        backgroundStudioNavAction({
          open: true,
          wasOpen: false,
          returning: false,
          pathname,
        }),
      ).toBe("return-to-chat");
    }
  });

  it("does not navigate again while returning from a non-chat surface", () => {
    expect(
      backgroundStudioNavAction({
        open: true,
        wasOpen: true,
        returning: true,
        pathname: "/settings/appearance",
      }),
    ).toBe("stay");
  });

  it("closes when leaving a chat for Settings, Usage, or Pull requests", () => {
    for (const pathname of ["/settings/general", "/usage", "/pull-requests"]) {
      expect(
        backgroundStudioNavAction({
          open: true,
          wasOpen: true,
          returning: false,
          pathname,
        }),
      ).toBe("close");
    }
  });

  it("stays open while switching chats", () => {
    expect(
      backgroundStudioNavAction({
        open: true,
        wasOpen: true,
        returning: false,
        pathname: "/environment-one/thread-two",
      }),
    ).toBe("stay");
  });
});
