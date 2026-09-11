import {
  FlutedGlass,
  GrainGradient,
  ImageDithering,
  LensDistortion,
  StaticMeshGradient,
} from "@paper-design/shaders-react";
import type { CustomBackgroundFilter } from "@t3tools/contracts";
import { memo } from "react";

import { isWebGlAvailable } from "~/customBackground/webgl";

// Every shader renders one frame (speed 0) and never repaints on its own.
// Without preserveDrawingBuffer the browser drops the drawing buffer after
// compositing, so any layer churn around the canvas (route swaps, the draft
// hero collapsing into a thread) re-composites a blank canvas for a frame.
const WEBGL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  preserveDrawingBuffer: true,
  antialias: false,
  depth: false,
};

// Cap GPU work on high-resolution displays; the background sits under a fade.
const MAX_PIXEL_COUNT = 1920 * 1200;

const SHADER_PROPS = {
  webGlContextAttributes: WEBGL_CONTEXT_ATTRIBUTES,
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
}

export const BackgroundRenderer = memo(function BackgroundRenderer({
  filter,
  image,
  fade,
}: BackgroundRendererProps) {
  if (filter.kind === "none") {
    if (!image) return null;
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src={image} alt="" className="absolute size-full object-cover" />
        <div className="absolute inset-0" style={fadeOverlayStyle(fade)} />
      </div>
    );
  }
  if (!isWebGlAvailable()) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <ShaderLayer filter={filter} image={image} />
      <div className="absolute inset-0" style={fadeOverlayStyle(fade)} />
    </div>
  );
});
