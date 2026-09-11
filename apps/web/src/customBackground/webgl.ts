/**
 * Same attributes Paper's mount uses. The probe has to ask for this exact
 * context, or a machine that can create a bare WebGL2 context still throws
 * when the shader canvas requests preserveDrawingBuffer.
 */
export const BACKGROUND_WEBGL_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  preserveDrawingBuffer: true,
  antialias: false,
  depth: false,
  failIfMajorPerformanceCaveat: false,
};

/**
 * One-shot WebGL2 probe. Paper's shader mount throws when it cannot get a
 * context, so callers skip the shader tree instead of mounting it.
 */
let webGlAvailable: boolean | null = null;

export function isWebGlAvailable(): boolean {
  if (webGlAvailable !== null) return webGlAvailable;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", BACKGROUND_WEBGL_CONTEXT_ATTRIBUTES);
    webGlAvailable = context !== null;
    // Release the probe context right away so it never counts against the
    // browser's live-context limit.
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webGlAvailable = false;
  }
  return webGlAvailable;
}
