# Handoff: Hinted — the family wishlist design system

## Overview

**Hinted** is the visual system for the private family wishlist app described in `reference/design-brief.md`. It covers both experiences the brief asks for: the **owner's workbench** (sign in, curate lists, add items, share a link) and the **giver's visit** (open a share link, browse, follow a product link out).

The direction is "paper and craft, quietly": brown-paper surfaces, perforated dashed rules, an unblurred offset shadow, brown-black ink, set in Newsreader Light with Hanken Grotesk. It is deliberately occasion-neutral — nothing in the system says December, or birthday, or anything seasonal. Dates and list names carry the occasion; the design never does.

The name **Hinted** was chosen from the brief's candidate list because a wishlist is a list of hints, and the word is warm without being cute or seasonal. The wordmark sets the second letter in accent italic: H*i*nted.

## About the design files

Everything in this bundle is a **design reference written in HTML/CSS/JSX** — prototypes that show intended look and behaviour. They are not production code to drop in.

The target codebase is the existing `wishlist` repo: **Hono JSX, server-rendered, Vite, Cloudflare Workers + D1**, with light client-side JS sprinkles (`src/client.ts`). The task is to **recreate these designs in that environment** using its conventions — see `CLAUDE.md` in that repo for commands and the verification loop.

Two practical notes about the translation:

- The component sources here are written as **React function components**. Hono JSX is API-compatible for everything used: function components, props, `{children}`, array `.map()`. The main edits are `className` → `class` (Hono accepts both; `class` is the repo idiom) and dropping the `import`/`export` shape into whatever the repo uses for `src/components/`.
- These components are **presentational only**. There is no state, no fetching and no routing in them. Interactivity that needs the client (expanding a row, the paste-a-URL fetch) is called out under *Interactions* below and should be built with the repo's chosen approach, not lifted from here.

## Fidelity

**High fidelity.** Colours, type, spacing, and the interaction model are final and should be matched exactly. Every value is tokenised in `styles.css`; prefer using the tokens over hard-coding the hexes listed in this document.

The one deliberate gap: **all product imagery in the mockups is a striped placeholder**. Real product photos are cached merchant images of mixed quality and aspect ratio. `ItemPhoto` handles all three cases (photo, placeholder, no photo at all).

---

## Design tokens

All of these live in `styles.css`. Light theme is `:root`; dark theme is `[data-theme="dark"]` on any ancestor — set it on `<html>` from a preference or `prefers-color-scheme`. Both themes are first-class; the brief names evening couch browsing as the primary giver context.

### Colour

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--paper` | `#e8e0d1` | `#211c15` | Page background |
| `--paper-card` | `#f4eee2` | `#2b241b` | Item cards, the open editor, the paste bar |
| `--paper-tag` | `#efe4cd` | `#372d21` | Note tags, the note textarea |
| `--paper-side` | `#ded3bf` | `#1b1710` | Desktop sidebar |
| `--paper-field` | `#fffdf8` | `#191510` | Text inputs |
| `--line` | `#cbbda3` | `#463a2b` | Hairlines, card borders |
| `--line-tag` | `#bfa87f` | `#6b573c` | Dashed tag borders |
| `--ink` | `#33291d` | `#eee4d2` | Body and headings |
| `--ink-soft` | `#63533e` | `#a99883` | Meta, prices, labels, sidebar items |
| `--ink-faint` | `#816e51` | `#87745c` | Drag handle, row menu |
| `--ink-tag` | `#775c2c` | `#c9a86a` | The NOTE label on a tag |
| `--ink-inverse` | `#f4eee2` | `#211c15` | Text on the primary button |
| `--accent` | `#8c4028` | `#d4784f` | Priority stamp, new-list link, hover |

Every ink token clears **WCAG AA against all four paper surfaces** (`--paper`, `--paper-card`, `--paper-tag`, `--paper-side`) — 4.5:1 for text, 3:1 for the non-text affordances. This was computed, not eyeballed. If you change a colour, re-check it against all four, not just the one you're looking at. True black never appears anywhere.

### Type

Two families, both Google Fonts, imported at the top of `styles.css`:

- `--font-display: "Newsreader", Georgia, serif` — names of things: page titles, list names, item titles. Weight 200 for page and list titles, 300 for item names. Negative tracking (`-.015em` to `-.02em`).
- `--font-ui: "Hanken Grotesk", system-ui, sans-serif` — everything you read or act on: body, notes, prices, buttons, labels.
- `--font-mono: ui-monospace, …` — tiny all-caps labels only.

| Role | Value | Token |
|---|---|---|
| Page title | Newsreader 200 · 44px / 1.02 · `-.02em` | `--size-page` |
| List title | Newsreader 200 · 38px / 1 | `--size-title` |
| Item name (card) | Newsreader 300 · 29px / 1.12 · `-.015em` | `--size-item` |
| Item name (row) | Newsreader 300 · 24px / 1.1 | `--size-item-sm` |
| List row name | Newsreader 300 · 25px / 1.05 | `--size-list` |
| Body, notes | Hanken 400 · 17px / 1.5 | `--size-body` |
| Meta, price | Hanken 400 · 15px / 1 | `--size-meta` |
| Small, row meta | Hanken 400 · 13–14px | `--size-small` |
| Label | Mono 500 · 10px · `.14em` · uppercase | `--size-label` |
| Button | Hanken 600 · 13px · `.12em` · uppercase | — |

Body text never goes below 17px on the giver page — the brief's grandparents-and-eight-year-olds constraint.

### Spacing, shape, targets

`--space-1` 4px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 22px · `--space-6` 30px · `--space-7` 44px

`--radius: 0` — **nothing in this system is rounded.** Paper is cut square. Pills, rounded cards and soft corners are the wrong direction here.

`--hit: 44px` — minimum height on every interactive element.

`--shadow-card: 2px 3px 0 rgba(51,41,29,.09)` (dark: `rgba(0,0,0,.35)`) — offset, **no blur**. A card resting on a table, not floating above it.

### The four texture decisions

These are what make it warm; if you drop them it becomes a spreadsheet.

1. **Dashed rule** — section breaks are `repeating-linear-gradient(90deg, var(--line) 0 5px, transparent 5px 10px)`, a perforation, never a solid keyline.
2. **Offset shadow** — 2px 3px, no blur.
3. **Dashed tag** — notes sit in a `1px dashed var(--line-tag)` box on `--paper-tag`, so they read as tied-on labels.
4. **Brown-black ink** — `#33291d`, never `#000`.

---

## Components

Sources are in `components/<Name>/<Name>.jsx`, with a `.d.ts` documenting every prop and a `card.html` demonstrating the states. Read the `.d.ts` files — they carry per-prop intent notes that aren't repeated here.

| Component | What it is |
|---|---|
| `Button` | `outline` (default), `primary` (solid ink), `accent`, `quiet`. `full` stretches it — the card CTA. Renders `<a>` when given `href`. |
| `Wordmark` | The product name in Newsreader 200 with one letter (`accentIndex`, default 1) in accent italic. |
| `PriorityStamp` | "Really wants this" — 2px accent border, `rotate(-2.5deg)`. `flat` variant (unrotated, 10px) for dense rows. |
| `NoteTag` | Dashed paper tag: small-caps label + the note at 17px. |
| `ItemPhoto` | Three states: `src` → cropped photo; `mockLabel` → striped placeholder (design-time only); neither → dashed empty box. The empty label's font size is derived from `height` so it fits at any scale. |
| `ItemCard` | The giver's read-only card. Composes ItemPhoto + PriorityStamp + NoteTag + Button. |
| `ItemRow` | The owner's row. `open` swaps it for `ItemEditor` in place. |
| `ItemEditor` | The expanded row: title, note, roughly-how-much, link, priority toggle, Remove, Done. |
| `ListRow` | One list on the owner's home. |
| `PasteBar` | The sticky add bar. |
| `ListNav` | Desktop sidebar: wordmark, list names, "+ New list". |

### Item card — the giver's rendering

The showpiece. It is the atomic unit of the whole product and everything else is chrome around it.

Structure, top to bottom, inside `background: var(--paper-card)`, `1px solid var(--line)`, `padding: 14px`, `box-shadow: var(--shadow-card)`:

1. **Priority stamp** (only if `priority`) — margin-bottom 12px.
2. **Photo** — full card width. Default height 150px; 96px when the item has no photo.
3. **Title** — Newsreader 300 / 29px, margin-top 14px.
4. **Price** (optional) — Hanken 15px, `--ink-soft`, margin-top 9px. Phrase it approximately: "About 649 kr". Never a checkout-looking price.
5. **Note** (optional) — the dashed tag, margin-top 13px. Notes are **not** fine print; they sit at 17px, the same size as body copy, because "size medium" is the whole reason the giver is reading.
6. **CTA** (only if `url`) — full-width outline button, "See it in the shop", margin-top 13px.

Everything below the title is optional and the card must look finished with any combination missing — a hand-typed "wool socks, any colour" with a note and no photo, price or link is a completely normal item, not a degraded one.

### Item row and item editor — the owner's rendering

Closed row is a 5-column grid: `22px 80px 1fr 132px 44px`, gap 20px, padding `16px 30px`, `border-bottom: 1px solid var(--line)`.

1. Drag handle `⋮⋮` (`--ink-faint`)
2. Photo, 72px tall
3. **Title + meta, wrapped in a button** — this is what opens the editor. Title hovers to `--accent`.
4. Priority stamp (flat) if set, otherwise empty — **read-only here**
5. `···` menu

Clicking the title area replaces the row, in place, with the editor. One row open at a time. This is the only editing surface: there is no dialog, no side panel, and no separate mobile path, so phone and desktop behave identically and the list never disappears from under you.

The editor is `background: var(--paper-card)`, inset hairlines top and bottom, padding `20px 30px 22px`, and a `80px 1fr` grid (photo, fields). Fields, in order:

- **What is it** — Newsreader 24px input
- **Note** — textarea styled as the dashed tag (`--paper-tag` background, dashed `--line-tag` border, 17px, min-height 76px), so the owner sees roughly what the giver will see. Placeholder: "Sizes, colour, which one — anything that helps."
- **Roughly** / **Link** — side by side, `1fr 1.7fr`
- **Actions** — the priority toggle on the left, then Remove (quiet underline) and Done (primary)

The **priority toggle** is a stamp that fills in: off is a 1.5px dashed `--line-tag` outline in `--ink-soft`; on is a 2px solid `--accent` outline in `--accent`. Use `aria-pressed`.

Below 640px the editor collapses to a single column and the price/link pair stacks.

---

## Screens

Three screens are drawn at full fidelity in `mockups/hinted-screens.html` (open it in a browser; it pans and zooms). It also carries the identity panel — wordmark, both palettes, and the type ladder.

### 1. Giver's list view — phone, the showpiece

The page someone opens from a link in the family group chat. No login, no account, **no actions at all** — it is purely for looking. Design it so an eight-year-old and a seventy-eight-year-old both get it instantly.

- **Top bar** — wordmark (21px) left, "Shared by Sofie" in a 10px uppercase label right. `padding: 16px 22px`, bottom hairline.
- **Header** — list name at Newsreader 200 / 44px, then the owner's line at 17px `--ink-soft`, max-width 300px. `padding: 24px 22px 18px`.
- **Dashed rule.**
- **Cards** — a flex column, `gap: 18px`, `padding: 18px 22px 44px`.
- **Closing line** — 15px `--ink-soft`, centred: "Sofie keeps this list up to date. Nothing you do here is recorded — sort out who gives what in the family chat, as always." This does real work: it tells the giver why there are no buttons.

Priority is the only loud thing on the page, and there should be at most one or two per list.

### 2. Owner's home — "Your lists"

Same bar and header treatment; the header reads "Your lists" with a line like "Four lists on the go. Tap one to tend it." Then a stack of `ListRow`s separated by hairlines, each with the list name in Newsreader 300 / 25px, a meta line ("5 things · shared with 6 people", or "Nothing here yet"), and a `→` in `--line`. A full-width outline "Start a new list" button sits below with 22px padding.

### 3. Owner's list editor — desktop

Two columns.

- **Sidebar**, 274px, `--paper-side`, right hairline, `padding: 26px 20px`: wordmark at 30px, a "Your lists" label, then the list names. The current list is `--paper-card` with a `--line` border and 600 weight; the others are `--ink-soft`. "+ New list" in `--accent` sits 10px below.
- **Main column**: the **paste bar is sticky at the top** — `--paper-card`, bottom hairline, `padding: 18px 30px`, a full-width input and a primary "Add" button. Placeholder: "Paste a link, or just type what you want…". Below it the list header (name at Newsreader 200 / 38px, meta line, and an outline "Copy share link" button on the right), then the item rows.

Typing plain words is a **first-class path**, not a fallback — the same field, the same button, no mode switch. "Wool socks, any colour" is a legitimate item.

The phone version of this screen is the same thing stacked: no sidebar (reach lists via back navigation), paste bar still sticky at top, rows full width.

---

## Interactions and behaviour

Only three things in this design need client-side JS. Everything else is server-rendered HTML and CSS.

**1. Expanding a row.** Click the row's title button → that row renders as the editor, any other open row closes. Server round-trip is acceptable; if you do it on the client, keep the DOM swap instantaneous — no animation. Escape or Done closes it. Focus should land on the title input when it opens, and return to the row's title button when it closes.

**2. Pasting a URL — the one micro-moment that gets delight.** The brief singles this out. Paste a link, hit Add, and the card writes itself in: the row appears immediately with the URL's host as its title, then the title, photo and price fill in as the fetch resolves. Do **not** use a skeleton screen or a spinner — the row is real from the first frame and its fields settle into place. Keep any transition under 200ms and only on the text/image swap. If the fetch fails, the row stays as a hand-typed item with the URL in the link field; that is a valid item, not an error.

**3. Copy share link.** Button copies, then reads "Copied" for about two seconds and reverts. No toast.

Everything else — hover (`--accent` on links and row titles), focus (`2px solid var(--accent)`, 2px offset, on every focusable), theme switching — is CSS.

**Do not add**: page transitions, scroll animations, entrance animations, hover lift on cards, or a loading state anywhere. The brief's fifth principle is that the app is fast and the design should ride that. Motion is not part of the warmth here; paper and type are.

### Copy voice

Human and plainspoken, always. "Nothing here yet — paste a link to get started." "Sofie really wants this one." "Drag to reorder. The order here is the order givers see." Never "item added successfully", never "0 items", never an exclamation mark.

---

## State

Presentational components hold none. What the screens need from the app:

- **Owner's home** — the signed-in person's lists, each with an item count and a share state.
- **Editor** — the list (name, occasion label as plain text, date), its items in owner-defined order, and which row is open. Item fields: title, note, price (string, approximate), url, image, priority, position.
- **Giver's page** — resolved from the share token: whose list, its name and label, and the items in order. No viewer identity, no viewer actions, nothing written back. The share link is the entire access model.
- **Theme** — light/dark, from `prefers-color-scheme` with a manual override persisted locally.

Reordering writes `position`; the giver sees exactly the owner's order.

## Assets

No image assets. The wordmark is live text (`Wordmark`), not a logo file. Both fonts come from Google Fonts and are imported at the top of `styles.css` — self-host them if you'd rather not have the third-party request; the app is edge-rendered and the font fetch will otherwise be the slowest thing on the page.

Every product image in the mockups is a CSS-striped placeholder with a monospace caption. Nothing in this bundle needs to ship.

## Files in this bundle

```
styles.css                        All tokens + component classes. The source of truth.
components/<Name>/<Name>.jsx      Component source (React-flavoured JSX).
components/<Name>/<Name>.d.ts     Props, with intent notes. Read these.
components/<Name>/card.html       Live demo of each component's states.
mockups/hinted-screens.html       The three screens at full fidelity, plus the identity panel.
mockups/four-directions.html      The four explored directions. Context for why this one.
reference/design-brief.md         The original brief.
```
