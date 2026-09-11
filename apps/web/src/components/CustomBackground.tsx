import { lazy, memo, Suspense } from "react";

import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useBackgroundImageUrl } from "~/customBackground/imageStore";
import {
  type CustomBackgroundRouteKind,
  backgroundIsRenderable,
  backgroundUsesStoredImage,
  resolveDisplayedBackground,
} from "~/customBackground/records";
import { useActiveBackground } from "~/customBackground/useActiveBackground";
import { isWebGlAvailable } from "~/customBackground/webgl";

// The shader library only loads once a client actually has a background
// selected, so clients on the plain theme never pay for it at startup.
const BackgroundRenderer = lazy(() =>
  import("./background/BackgroundRenderer").then((module) => ({
    default: module.BackgroundRenderer,
  })),
);

export const CustomBackground = memo(function CustomBackground({
  routeKind,
}: {
  routeKind: CustomBackgroundRouteKind;
}) {
  const inConversations = useClientSettings((settings) => settings.customBackgroundInConversations);
  const selected = useActiveBackground();
  const enabled = useClientSettings((settings) => settings.customBackgroundEnabled);
  const editing = useBackgroundStudioStore((store) => store.open);
  const preview = useBackgroundStudioStore((store) => store.preview);
  const record = resolveDisplayedBackground({
    selected,
    preview,
    enabled,
    editing,
    routeKind,
    inConversations,
  });
  const filtersAvailable = isWebGlAvailable();
  const imageId =
    record !== null && backgroundUsesStoredImage(record, filtersAvailable)
      ? record.source.imageId
      : null;
  const image = useBackgroundImageUrl(imageId);
  if (!record || !backgroundIsRenderable(record, filtersAvailable)) return null;
  if (imageId !== null && typeof image !== "string") return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <Suspense fallback={null}>
        <BackgroundRenderer
          filter={record.filter}
          image={typeof image === "string" ? image : null}
          fade={record.fade}
          filtersAvailable={filtersAvailable}
        />
      </Suspense>
    </div>
  );
});
