// Overlapping masks taper each backdrop filter into the next without painting
// a header surface over the wallpaper.
const BLUR_LAYERS = [32, 16, 8, 4, 2, 1, 0.5].map((blur, index) => {
  const mask = `linear-gradient(to bottom, ${index === 0 ? "#000 0%" : `transparent ${(index - 1) * 12.5}%`}, #000 ${index * 12.5}%, #000 ${(index + 1) * 12.5}%, transparent ${(index + 2) * 12.5}%)`;
  return {
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
});

export function ChatTopbarBlur() {
  return (
    <div
      aria-hidden="true"
      className="custom-background-topbar-blur pointer-events-none absolute inset-x-0 top-0 z-[5] h-[calc(var(--workspace-topbar-height)+1.5rem)] overflow-hidden"
    >
      {BLUR_LAYERS.map((style) => (
        <div key={style.backdropFilter} className="absolute inset-0" style={style} />
      ))}
    </div>
  );
}
