export function Wordmark({
  name = "Hinted",
  accentIndex = 1,
  size = 30,
}: {
  name?: string;
  accentIndex?: number;
  size?: number;
}) {
  return (
    <span class="hn-wordmark" style={{ fontSize: `${size}px` }}>
      {Array.from(name).map((c, i) =>
        i === accentIndex ? <em>{c}</em> : <span>{c}</span>,
      )}
    </span>
  );
}
