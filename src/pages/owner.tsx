import { ItemEditor } from "../components/ItemEditor";
import { ItemRow } from "../components/ItemRow";
import { ListNav } from "../components/ListNav";
import { ListRow } from "../components/ListRow";
import { PasteBar } from "../components/PasteBar";
import { Wordmark } from "../components/Wordmark";
import type { items, lists, users } from "../db/schema";

type List = typeof lists.$inferSelect;
type Item = typeof items.$inferSelect;
type User = typeof users.$inferSelect;

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function OwnerBar({ user }: { user: User }) {
  return (
    <header class="hn-bar">
      <a href="/" class="hn-bar__brand">
        <Wordmark size={21} />
      </a>
      <span class="hn-bar__right">
        <span class="hn-bar__label">{firstName(user.name)}</span>
        <button class="hn-bar__quiet" type="button" data-theme-toggle>
          Theme
        </button>
        <form method="post" action="/logout">
          <button class="hn-bar__quiet" type="submit">
            Sign out
          </button>
        </form>
      </span>
    </header>
  );
}

function listMeta(list: List, itemCount: number): string {
  const parts = [
    itemCount === 0
      ? "Nothing here yet"
      : itemCount === 1
        ? "1 thing"
        : `${itemCount} things`,
  ];
  if (list.occasionLabel) parts.push(list.occasionLabel);
  return parts.join(" · ");
}

export function OwnerHomePage({
  user,
  ownedLists,
}: {
  user: User;
  ownedLists: Array<{ list: List; itemCount: number }>;
}) {
  const intro =
    ownedLists.length === 0
      ? "Nothing here yet. Start a list and paste in the first thing you'd love."
      : ownedLists.length === 1
        ? "One list on the go. Tap it to tend it."
        : `${["Two", "Three", "Four", "Five", "Six"][ownedLists.length - 2] ?? ownedLists.length} lists on the go. Tap one to tend it.`;
  return (
    <div class="hn-page">
      <OwnerBar user={user} />
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">Your lists</h1>
        <p class="hn-pagehead__intro">{intro}</p>
      </div>
      <hr class="hn-rule" />
      <main>
        {ownedLists.map(({ list, itemCount }) => (
          <ListRow
            name={list.name}
            meta={listMeta(list, itemCount)}
            href={`/lists/${list.id}`}
          />
        ))}
        <div class="hn-homeactions">
          <a class="hn-btn hn-btn--full" href="/lists/new">
            Start a new list
          </a>
        </div>
      </main>
    </div>
  );
}

export function NewListPage({ user }: { user: User }) {
  return (
    <div class="hn-page">
      <OwnerBar user={user} />
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">A new list</h1>
        <p class="hn-pagehead__intro">
          Name it whatever you like — "My birthday", "Kitchen stuff".
        </p>
      </div>
      <form method="post" action="/lists" class="hn-form">
        <label class="hn-field">
          <span class="hn-field__label">Name</span>
          {/* biome-ignore lint/a11y/noAutofocus: single-purpose page; focus belongs here */}
          <input
            class="hn-input hn-input--title"
            name="name"
            required
            autofocus
          />
        </label>
        <button class="hn-btn hn-btn--primary hn-btn--full" type="submit">
          Create it
        </button>
      </form>
    </div>
  );
}

export function EditorPage({
  user,
  allLists,
  list,
  listItems,
  openItemId,
  enriching = false,
  shareUrl,
}: {
  user: User;
  allLists: Array<{ id: number; name: string }>;
  list: List;
  listItems: Item[];
  openItemId?: number;
  enriching?: boolean;
  shareUrl: string;
}) {
  const metaParts = [
    listItems.length === 0
      ? "Nothing here yet"
      : listItems.length === 1
        ? "1 thing"
        : `${listItems.length} things`,
  ];
  if (list.occasionLabel) metaParts.push(list.occasionLabel);
  return (
    <div class="hn-shell">
      <ListNav items={allLists} currentId={list.id} />
      <div class="hn-shell__main">
        <div class="hn-mobilebar">
          <OwnerBar user={user} />
        </div>
        <PasteBar action={`/lists/${list.id}/items`} />
        <div class="hn-listhead">
          <div>
            <h1 class="hn-listhead__title">{list.name}</h1>
            <p class="hn-listhead__meta">
              {metaParts.join(" · ")} ·{" "}
              <a class="hn-quietlink" href={`/lists/${list.id}/settings`}>
                Edit details
              </a>
            </p>
          </div>
          <button class="hn-btn" type="button" data-copy={shareUrl}>
            Copy share link
          </button>
        </div>
        <main>
          {listItems.map((item) =>
            item.id === openItemId ? (
              <ItemEditor item={item} listId={list.id} enrich={enriching} />
            ) : (
              <ItemRow item={item} listId={list.id} />
            ),
          )}
          {listItems.length === 0 ? (
            <p class="hn-empty">
              Nothing here yet — paste a link to get started.
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export function ListSettingsPage({ user, list }: { user: User; list: List }) {
  return (
    <div class="hn-page">
      <OwnerBar user={user} />
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">List details</h1>
      </div>
      <form method="post" action={`/lists/${list.id}`} class="hn-form">
        <label class="hn-field">
          <span class="hn-field__label">Name</span>
          <input
            class="hn-input hn-input--title"
            name="name"
            value={list.name}
            required
          />
        </label>
        <label class="hn-field">
          <span class="hn-field__label">Occasion</span>
          <input
            class="hn-input"
            name="occasionLabel"
            value={list.occasionLabel ?? ""}
            placeholder="Birthday, Christmas — or leave it out"
          />
        </label>
        <label class="hn-field">
          <span class="hn-field__label">A line for your givers</span>
          <textarea
            class="hn-input hn-input--note"
            name="intro"
            rows={2}
            placeholder="A few things I'd love. No rush, no pressure — just hints."
          >
            {list.intro ?? ""}
          </textarea>
        </label>
        <div class="hn-edit__actions">
          <a class="hn-remove" href={`/lists/${list.id}/delete`}>
            Delete this list
          </a>
          <span class="hn-edit__spacer"></span>
          <a class="hn-btn" href={`/lists/${list.id}`}>
            Cancel
          </a>
          <button class="hn-btn hn-btn--primary" type="submit">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDeletePage({
  user,
  list,
  itemCount,
}: {
  user: User;
  list: List;
  itemCount: number;
}) {
  return (
    <div class="hn-page">
      <OwnerBar user={user} />
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">Delete "{list.name}"?</h1>
        <p class="hn-pagehead__intro">
          {itemCount === 0
            ? "It's empty, so nothing of value will be lost."
            : `It holds ${itemCount === 1 ? "one thing" : `${itemCount} things`}. This can't be undone, and its share link stops working.`}
        </p>
      </div>
      <form method="post" action={`/lists/${list.id}/delete`} class="hn-form">
        <div class="hn-edit__actions">
          <a class="hn-btn" href={`/lists/${list.id}`}>
            Keep it
          </a>
          <span class="hn-edit__spacer"></span>
          <button class="hn-btn hn-btn--primary" type="submit">
            Delete the list
          </button>
        </div>
      </form>
    </div>
  );
}
