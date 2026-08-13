export function ListRow({
  name,
  meta,
  href,
}: {
  name: string;
  meta?: string;
  href: string;
}) {
  return (
    <a class="hn-lrow" href={href}>
      <span class="hn-lrow__text">
        <span class="hn-lrow__name">{name}</span>
        {meta ? <span class="hn-lrow__meta">{meta}</span> : null}
      </span>
      <span class="hn-lrow__arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
