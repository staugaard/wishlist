import { Wordmark } from "./Wordmark";

export function ListNav({
  label = "Your lists",
  items,
  currentId,
  newLabel = "+ New list",
}: {
  label?: string;
  items: Array<{ id: number; name: string }>;
  currentId: number;
  newLabel?: string;
}) {
  return (
    <nav class="hn-nav">
      <div class="hn-nav__brand">
        <a href="/" class="hn-nav__brandlink">
          <Wordmark size={30} />
        </a>
      </div>
      <div class="hn-label hn-nav__label">{label}</div>
      {items.map((it) => (
        <a
          href={`/lists/${it.id}`}
          class={`hn-nav__item${it.id === currentId ? " is-current" : ""}`}
        >
          {it.name}
        </a>
      ))}
      <a href="/lists/new" class="hn-nav__item hn-nav__item--new">
        {newLabel}
      </a>
    </nav>
  );
}
