import { useLocation, useRouterState, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";

import {
  backgroundStudioChatPath,
  backgroundStudioNavAction,
  isBackgroundStudioDismissPath,
} from "~/customBackground/backgroundStudioNavigation";
import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { useThemeEditorStore } from "../settings/themeEditorStore";

const BackgroundStudioPanel = lazy(() =>
  import("./BackgroundStudioPanel").then((module) => ({ default: module.BackgroundStudioPanel })),
);

export function BackgroundStudioHost() {
  const open = useBackgroundStudioStore((store) => store.open);
  const closeBackgroundStudio = useBackgroundStudioStore((store) => store.closeBackgroundStudio);
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const chatPath = useRouterState({
    select: (state) => backgroundStudioChatPath(state.matches),
  });
  const lastChat = useRef<string | null>(null);
  const wasOpen = useRef(false);
  const returning = useRef(false);
  const dismiss = isBackgroundStudioDismissPath(pathname);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the router on a chat while the floating studio is open.
  useEffect(() => {
    if (chatPath !== null) lastChat.current = chatPath;
    const action = backgroundStudioNavAction({
      open,
      wasOpen: wasOpen.current,
      returning: returning.current,
      pathname,
    });
    if (action === "return-to-chat") {
      returning.current = true;
      void navigate({ to: lastChat.current ?? "/" });
    } else if (action === "close") {
      returning.current = false;
      closeBackgroundStudio();
    } else if (open && !dismiss) {
      returning.current = false;
    }
    wasOpen.current = open;
  }, [chatPath, closeBackgroundStudio, dismiss, navigate, open, pathname]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Subscribe to the theme editor so the two floating editors cannot overlap.
  useEffect(
    () =>
      useThemeEditorStore.subscribe((store) => {
        if (store.session !== null) closeBackgroundStudio();
      }),
    [closeBackgroundStudio],
  );

  if (!open || dismiss) return null;
  return (
    <Suspense fallback={null}>
      <BackgroundStudioPanel onClose={closeBackgroundStudio} />
    </Suspense>
  );
}
