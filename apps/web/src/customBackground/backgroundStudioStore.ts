import type { CustomBackgroundRecord } from "@t3tools/contracts";
import { create } from "zustand";

import { useThemeEditorStore } from "~/components/settings/themeEditorStore";

type BackgroundStudioStore = {
  open: boolean;
  preview: CustomBackgroundRecord | null;
  setPreview: (record: CustomBackgroundRecord | null) => void;
  openBackgroundStudio: () => void;
  closeBackgroundStudio: () => void;
};

export const useBackgroundStudioStore = create<BackgroundStudioStore>((set) => ({
  open: false,
  preview: null,
  setPreview: (preview) => set({ preview }),
  openBackgroundStudio: () => {
    useThemeEditorStore.getState().closeThemeEditor();
    set({ open: true });
  },
  closeBackgroundStudio: () => set({ open: false }),
}));

export function toggleBackgroundStudio(): void {
  const store = useBackgroundStudioStore.getState();
  if (store.open) store.closeBackgroundStudio();
  else store.openBackgroundStudio();
}
