import { ItemCard } from "../components/ItemCard";
import { Wordmark } from "../components/Wordmark";
import type { items, lists, users } from "../db/schema";
import { itemImageSrc } from "../lib/itemImage";

type List = typeof lists.$inferSelect;
type Item = typeof items.$inferSelect;
type User = typeof users.$inferSelect;

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

// The giver's page — purely for looking (handoff §Screens 1).
export function GiverListPage({
  list,
  owner,
  listItems,
}: {
  list: List;
  owner: User;
  listItems: Item[];
}) {
  const name = firstName(owner.name);
  return (
    <div class="hn-page">
      <header class="hn-bar">
        <Wordmark size={21} />
        <span class="hn-bar__label">Shared by {name}</span>
      </header>
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">{list.name}</h1>
        {list.intro ? <p class="hn-pagehead__intro">{list.intro}</p> : null}
      </div>
      <hr class="hn-rule" />
      <main class="hn-cards">
        {listItems.map((item) => (
          <ItemCard
            title={item.title}
            price={item.price}
            note={item.note}
            url={item.url}
            image={itemImageSrc(item)}
            priority={item.priority}
          />
        ))}
      </main>
      <p class="hn-closing">
        {name} keeps this list up to date. Nothing you do here is recorded —
        sort out who gives what in the family chat, as always.
      </p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div class="hn-page">
      <header class="hn-bar">
        <Wordmark size={21} />
      </header>
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">This list isn't here.</h1>
        <p class="hn-pagehead__intro">
          Check the link you were sent — it has to match exactly.
        </p>
      </div>
    </div>
  );
}
