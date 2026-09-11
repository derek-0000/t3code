import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { useActiveBackground } from "~/customBackground/useActiveBackground";
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { MonitorCog } from "lucide-react";

export function CustomBackgroundSettings() {
  const active = useActiveBackground();
  const enabled = useClientSettings((settings) => settings.customBackgroundEnabled);
  const libraryCount = useClientSettings((settings) => settings.customBackgrounds.length);
  const updateSettings = useUpdateClientSettings();
  const openBackgroundStudio = useBackgroundStudioStore((store) => store.openBackgroundStudio);

  return (
    <SettingsSection id="appearance-background" title="Background">
      <SettingsRow
        {...searchableSetting("custom-background")}
        description="Customize a picture or gradient directly behind your chats. Saved only on this client."
        status={
          active
            ? `Selected: “${active.name}”`
            : libraryCount > 0
              ? `${libraryCount} saved, none selected`
              : null
        }
        resetAction={
          active ? (
            <SettingResetButton
              label="custom background"
              onClick={() => updateSettings({ activeCustomBackgroundId: null })}
            />
          ) : null
        }
        control={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={!enabled} onClick={openBackgroundStudio}>
              <MonitorCog /> Customize background
            </Button>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                updateSettings({ customBackgroundEnabled: Boolean(checked) })
              }
              aria-label="Enable custom background"
            />
          </div>
        }
      />
    </SettingsSection>
  );
}
