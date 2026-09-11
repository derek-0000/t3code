/**
 * One-shot WebGL2 probe. Paper's shader mount throws when it cannot get a
 * context, so the renderer checks here first and draws nothing instead of
 * tripping an error boundary on machines without GPU acceleration.
 */
let webGlAvailable: boolean | null = null;

export function isWebGlAvailable(): boolean {
  if (webGlAvailable !== null) return webGlAvailable;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    webGlAvailable = context !== null;
    // Release the probe context right away so it never counts against the
    // browser's live-context limit.
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webGlAvailable = false;
  }
  return webGlAvailable;
}
