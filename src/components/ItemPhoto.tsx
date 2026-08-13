export function ItemPhoto({
  src,
  alt = "",
  height = 170,
  emptyLabel = "no photo",
}: {
  src?: string;
  alt?: string;
  height?: number;
  emptyLabel?: string;
}) {
  if (src) {
    return (
      <img
        class="hn-photo"
        src={src}
        alt={alt}
        loading="lazy"
        style={{ height: `${height}px`, objectFit: "cover" }}
      />
    );
  }
  // Empty-label size derived from height so it fits at any scale (per handoff).
  const size = Math.max(12, Math.min(30, Math.round(height * 0.24)));
  return (
    <div
      class="hn-photo hn-photo--empty"
      style={{ height: `${height}px`, display: "grid", placeItems: "center" }}
    >
      <span class="hn-photo__label" style={{ fontSize: `${size}px` }}>
        {emptyLabel}
      </span>
    </div>
  );
}
