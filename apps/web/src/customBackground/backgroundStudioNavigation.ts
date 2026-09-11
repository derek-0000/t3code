import type { AnyRouteMatch } from "@tanstack/react-router";

const DRAFT_ROUTE_ID = "/_chat/draft/$draftId";
const CONVERSATION_ROUTE_ID = "/_chat/$environmentId/$threadId";

export type BackgroundStudioNavAction = "stay" | "return-to-chat" | "close";

/** Read the path from the match: location can already point at a pending Settings route. */
export function backgroundStudioChatPath(
  matches: ReadonlyArray<Pick<AnyRouteMatch, "routeId" | "pathname">>,
): string | null {
  return (
    matches.find(
      (match) => match.routeId === DRAFT_ROUTE_ID || match.routeId === CONVERSATION_ROUTE_ID,
    )?.pathname ?? null
  );
}

/** Settings, Usage, and Pull requests are not chat surfaces; the controller must not overlay them. */
export function isBackgroundStudioDismissPath(pathname: string): boolean {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/usage" ||
    pathname.startsWith("/usage/") ||
    pathname === "/pull-requests" ||
    pathname.startsWith("/pull-requests/")
  );
}

export function backgroundStudioNavAction({
  open,
  wasOpen,
  returning,
  pathname,
}: {
  open: boolean;
  wasOpen: boolean;
  returning: boolean;
  pathname: string;
}): BackgroundStudioNavAction {
  if (!open || !isBackgroundStudioDismissPath(pathname)) return "stay";
  if (returning) return "stay";
  return wasOpen ? "close" : "return-to-chat";
}
