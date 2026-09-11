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
  const themeSession = useThemeEditorStore((store) => store.session);
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const chatPath = useRouterState({
    select: (state) => backgroundStudioChatPath(state.matches),
  });
  const lastChat = useRef<string | null>(null);
  const wasOpen = useRef(false);
  const returning = useRef(false);
  const dismiss = isBackgroundStudioDismissPath(pathname);

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

  useEffect(() => {
    if (themeSession !== null) closeBackgroundStudio();
  }, [closeBackgroundStudio, themeSession]);

  if (!open || dismiss) return null;
  return (
    <Suspense fallback={null}>
      <BackgroundStudioPanel onClose={closeBackgroundStudio} />
    </Suspense>
  );
}
