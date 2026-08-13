import type { items } from "../db/schema";
import { safeHttpUrl } from "../lib/url";
import { ItemPhoto } from "./ItemPhoto";
import { PriorityStamp } from "./PriorityStamp";

type Item = typeof items.$inferSelect;

function rowMeta(item: Item): string | undefined {
  const parts: string[] = [];
  if (item.price) parts.push(item.price);
  const href = safeHttpUrl(item.url);
  if (href) parts.push(new URL(href).hostname);
  if (parts.length > 0) return parts.join(" · ");
  return item.note ?? undefined;
}

// The owner's closed row. Clicking the title area opens the editor in place
// (URL state, server round-trip — per the handoff's allowance).
export function ItemRow({ item, listId }: { item: Item; listId: number }) {
  return (
    <div class="hn-row">
      <span class="hn-row__grip" aria-hidden="true">
        ⋮⋮
      </span>
      <ItemPhoto
        src={item.imageUrl ?? undefined}
        alt={item.title}
        height={72}
      />
      <a class="hn-row__open" href={`/lists/${listId}?item=${item.id}`}>
        <span class="hn-row__title">{item.title}</span>
        {rowMeta(item) ? (
          <span class="hn-row__meta">{rowMeta(item)}</span>
        ) : null}
      </a>
      <span class="hn-row__flag">
        {item.priority ? (
          <PriorityStamp flat>Really wants</PriorityStamp>
        ) : null}
      </span>
      <span class="hn-row__movers">
        <form method="post" action={`/items/${item.id}/move`}>
          <input type="hidden" name="direction" value="up" />
          <button
            class="hn-move"
            type="submit"
            aria-label={`Move ${item.title} up`}
          >
            ↑
          </button>
        </form>
        <form method="post" action={`/items/${item.id}/move`}>
          <input type="hidden" name="direction" value="down" />
          <button
            class="hn-move"
            type="submit"
            aria-label={`Move ${item.title} down`}
          >
            ↓
          </button>
        </form>
      </span>
    </div>
  );
}
