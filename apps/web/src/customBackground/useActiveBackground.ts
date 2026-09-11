import type { CustomBackgroundRecord } from "@t3tools/contracts";
import { useClientSettings } from "~/hooks/useSettings";

/** The library entry currently selected in the studio, whether or not it is shown. */
export function useActiveBackground(): CustomBackgroundRecord | null {
  return useClientSettings((settings) =>
    settings.activeCustomBackgroundId === null
      ? null
      : (settings.customBackgrounds.find(
          (record) => record.id === settings.activeCustomBackgroundId,
        ) ?? null),
  );
}
