import { safeHttpUrl } from "../lib/url";
import { Button } from "./Button";
import { ItemPhoto } from "./ItemPhoto";
import { NoteTag } from "./NoteTag";
import { PriorityStamp } from "./PriorityStamp";

// The giver's read-only card — the product's atomic visual unit. Everything
// below the title is optional and the card must look finished with any
// combination missing (handoff §Components).
export function ItemCard({
  title,
  price,
  note,
  url,
  image,
  priority = false,
  ctaLabel = "See it in the shop",
}: {
  title: string;
  /** Approximate and optional — "About 649 kr", never a checkout price. */
  price?: string | null;
  note?: string | null;
  url?: string | null;
  image?: string | null;
  /** At most one or two per list. */
  priority?: boolean;
  ctaLabel?: string;
}) {
  const href = safeHttpUrl(url);
  return (
    <article class="hn-card">
      {priority ? (
        <div class="hn-card__stamp">
          <PriorityStamp />
        </div>
      ) : null}
      {image ? <ItemPhoto src={image} alt={title} height={150} /> : null}
      <h2 class="hn-card__title">{title}</h2>
      {price ? <p class="hn-card__price">{price}</p> : null}
      {note ? (
        <div class="hn-card__note">
          <NoteTag>{note}</NoteTag>
        </div>
      ) : null}
      {href ? (
        <div class="hn-card__cta">
          <Button full href={href}>
            {ctaLabel}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
