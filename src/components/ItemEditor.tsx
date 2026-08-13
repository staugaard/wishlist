import type { items } from "../db/schema";
import { ItemPhoto } from "./ItemPhoto";

type Item = typeof items.$inferSelect;

// The expanded row — the only editing surface (no dialog, no side panel).
export function ItemEditor({ item, listId }: { item: Item; listId: number }) {
  return (
    <form method="post" action={`/items/${item.id}`} class="hn-edit">
      <input type="hidden" name="list" value={String(listId)} />
      <div class="hn-edit__grid">
        <ItemPhoto
          src={item.imageUrl ?? undefined}
          alt={item.title}
          height={80}
        />
        <div class="hn-edit__fields">
          <label class="hn-field">
            <span class="hn-field__label">What is it</span>
            {/* biome-ignore lint/a11y/noAutofocus: the handoff requires focus on the title when the editor opens */}
            <input
              class="hn-input hn-input--title"
              name="title"
              value={item.title}
              placeholder="Wool socks, any colour"
              required
              autofocus
            />
          </label>
          <label class="hn-field">
            <span class="hn-field__label">Note</span>
            <textarea
              class="hn-input hn-input--note"
              name="note"
              rows={2}
              placeholder="Sizes, colour, which one — anything that helps."
            >
              {item.note ?? ""}
            </textarea>
          </label>
          <div class="hn-edit__pair">
            <label class="hn-field">
              <span class="hn-field__label">Roughly</span>
              <input
                class="hn-input"
                name="price"
                value={item.price ?? ""}
                placeholder="649 kr"
              />
            </label>
            <label class="hn-field">
              <span class="hn-field__label">Link</span>
              <input
                class="hn-input"
                name="url"
                value={item.url ?? ""}
                placeholder="Optional — paste a shop link"
              />
            </label>
          </div>
          <div class="hn-edit__actions">
            <label class="hn-toggle">
              <input type="checkbox" name="priority" checked={item.priority} />
              Really wants this
            </label>
            <span class="hn-edit__spacer"></span>
            <button
              type="submit"
              class="hn-remove"
              formaction={`/items/${item.id}/delete`}
            >
              Remove
            </button>
            <button type="submit" class="hn-btn hn-btn--primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
