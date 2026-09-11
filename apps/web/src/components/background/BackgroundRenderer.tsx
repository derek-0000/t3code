import {
  FlutedGlass,
  GrainGradient,
  ImageDithering,
  LensDistortion,
  StaticMeshGradient,
} from "@paper-design/shaders-react";
import type { CustomBackgroundFilter } from "@t3tools/contracts";
import { memo } from "react";

import { BACKGROUND_WEBGL_CONTEXT_ATTRIBUTES } from "~/customBackground/webgl";
import { backgroundDrawMode } from "~/customBackground/records";

// Cap GPU work on high-resolution displays; the background sits under a fade.
const MAX_PIXEL_COUNT = 1920 * 1200;

const SHADER_PROPS = {
  webGlContextAttributes: BACKGROUND_WEBGL_CONTEXT_ATTRIBUTES,
  width: "100%",
  height: "100%",
  speed: 0,
  minPixelRatio: 1,
  maxPixelCount: MAX_PIXEL_COUNT,
  className: "absolute inset-0",
} as const;

function ShaderLayer({ filter, image }: { filter: CustomBackgroundFilter; image: string | null }) {
  switch (filter.kind) {
    case "none":
      return null;
    case "image-dithering": {
      if (!image) return null;
      const { kind: _kind, ...params } = filter;
      return <ImageDithering image={image} {...params} {...SHADER_PROPS} />;
    }
    case "fluted-glass": {
      if (!image) return null;
      const { kind: _kind, ...params } = filter;
      return <FlutedGlass image={image} {...params} {...SHADER_PROPS} />;
    }
    case "lens-distortion": {
      if (!image) return null;
      const { kind: _kind, ...params } = filter;
      return <LensDistortion image={image} {...params} {...SHADER_PROPS} />;
    }
    case "static-mesh-gradient": {
      const { kind: _kind, colors, ...params } = filter;
      return <StaticMeshGradient colors={[...colors]} {...params} {...SHADER_PROPS} />;
    }
    case "grain-gradient": {
      const { kind: _kind, colors, variation, ...params } = filter;
      return <GrainGradient colors={[...colors]} frame={variation} {...params} {...SHADER_PROPS} />;
    }
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function fadeOverlayStyle(fade: number): React.CSSProperties {
  const stop = (share: number) =>
    `color-mix(in srgb, var(--background) ${Math.round(fade * share)}%, transparent)`;
  return {
    background: `linear-gradient(to top, ${stop(1)}, ${stop(0.65)} 50%, ${stop(0.8)})`,
  };
}

export interface BackgroundRendererProps {
  filter: CustomBackgroundFilter;
  /** Object URL of the source image; null for generative filters or while loading. */
  image: string | null;
  fade: number;
  /** When false, skip Paper entirely and draw the photo if one is loaded. */
  filtersAvailable: boolean;
}

export const BackgroundRenderer = memo(function BackgroundRenderer({
  filter,
  image,
  fade,
  filtersAvailable,
}: BackgroundRendererProps) {
  const mode = backgroundDrawMode({
    filter,
    hasImage: typeof image === "string",
    filtersAvailable,
  });
  if (mode === "none") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {mode === "image" && typeof image === "string" ? (
        <img src={image} alt="" className="absolute size-full object-cover" />
      ) : (
        <ShaderLayer filter={filter} image={image} />
      )}
      <div className="absolute inset-0" style={fadeOverlayStyle(fade)} />
    </div>
  );
});
