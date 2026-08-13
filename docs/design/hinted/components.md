# Component sources

Every component in the Hinted system, with its prop contract. Written as React function components; see the README for the Hono JSX translation notes.

These are inlined here as one document on purpose — they are reference material to read and port, not files to drop into a build.

---

## Button

### Props — `Button.d.ts`

```ts
import * as React from "react";
export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual weight. Use `primary` once per screen. */
  variant?: "outline" | "primary" | "accent" | "quiet";
  /** Stretch to the container width — the phone card CTA. */
  full?: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  type?: "button" | "submit";
}
export declare function Button(props: ButtonProps): JSX.Element;
```

### Source — `Button.jsx`

```jsx
export function Button({ children = "Button", variant = "outline", full = false, href, onClick, type = "button" }) {
  const cls = ["hn-btn", "hn-btn--" + variant, full ? "hn-btn--full" : ""].filter(Boolean).join(" ");
  if (href) return <a className={cls} href={href} onClick={onClick}>{children}</a>;
  return <button className={cls} type={type} onClick={onClick}>{children}</button>;
}
```

---

## Wordmark

### Props — `Wordmark.d.ts`

```ts
export interface WordmarkProps {
  /** The product name. */
  name?: string;
  /** Which letter is set in accent italic. -1 for none. */
  accentIndex?: number;
  /** Font size in px. */
  size?: number;
}
export declare function Wordmark(props: WordmarkProps): JSX.Element;
```

### Source — `Wordmark.jsx`

```jsx
export function Wordmark({ name = "Hinted", accentIndex = 1, size = 30 }) {
  return (
    <span className="hn-wordmark" style={{ fontSize: size }}>
      {Array.from(name).map((c, i) => (i === accentIndex ? <em key={i}>{c}</em> : <span key={i}>{c}</span>))}
    </span>
  );
}
```

---

## PriorityStamp

### Props — `PriorityStamp.d.ts`

```ts
import * as React from "react";
export interface PriorityStampProps {
  children?: React.ReactNode;
  /** Unrotated, smaller — for dense rows in the editor. */
  flat?: boolean;
}
export declare function PriorityStamp(props: PriorityStampProps): JSX.Element;
```

### Source — `PriorityStamp.jsx`

```jsx
export function PriorityStamp({ children = "Really wants this", flat = false }) {
  return <span className={"hn-stamp" + (flat ? " hn-stamp--flat" : "")}>{children}</span>;
}
```

---

## NoteTag

### Props — `NoteTag.d.ts`

```ts
import * as React from "react";
export interface NoteTagProps {
  /** Small caps label on the left. */
  label?: string;
  /** The note itself — sizes, colours, "ask Mum". */
  children?: React.ReactNode;
}
export declare function NoteTag(props: NoteTagProps): JSX.Element;
```

### Source — `NoteTag.jsx`

```jsx
export function NoteTag({ label = "Note", children }) {
  return (
    <div className="hn-note">
      <span className="hn-note__label">{label}</span>
      <p className="hn-note__text">{children}</p>
    </div>
  );
}
```

---

## ItemPhoto

### Props — `ItemPhoto.d.ts`

```ts
export interface ItemPhotoProps {
  /** Cached merchant photo. Any aspect ratio; cropped to `height`. */
  src?: string;
  alt?: string;
  /** Box height in px. */
  height?: number;
  /** Shown when there is no photo — a hand-typed item. */
  emptyLabel?: string;
  /** Design-time only: renders the striped placeholder with this caption. */
  mockLabel?: string;
}
export declare function ItemPhoto(props: ItemPhotoProps): JSX.Element;
```

### Source — `ItemPhoto.jsx`

```jsx
export function ItemPhoto({ src, alt = "", height = 170, emptyLabel = "no photo", mockLabel }) {
  const style = { height: height };
  if (src) return <img className="hn-photo" src={src} alt={alt} style={{ height: height, objectFit: "cover" }} />;
  if (mockLabel) return <div className="hn-photo" style={style}><span className="hn-photo__label">{mockLabel}</span></div>;
  const size = Math.max(12, Math.min(30, Math.round(height * 0.24)));
  return (
    <div className="hn-photo hn-photo--empty" style={style}>
      <span className="hn-photo__label" style={{ fontSize: size }}>{emptyLabel}</span>
    </div>
  );
}
```

---

## ItemCard

### Props — `ItemCard.d.ts`

```ts
export interface ItemCardProps {
  title: string;
  /** Approximate and optional — "About 649 kr", never a checkout price. */
  price?: string;
  /** Sizes, colours, which one. Rendered as a note tag, not fine print. */
  note?: string;
  /** Product link. Omit and the card shows no CTA. */
  url?: string;
  image?: string;
  imageHeight?: number;
  /** "Really wants this" — at most one or two per list. */
  priority?: boolean;
  /** Design-time only: striped placeholder caption. */
  mockLabel?: string;
  ctaLabel?: string;
}
export declare function ItemCard(props: ItemCardProps): JSX.Element;
```

### Source — `ItemCard.jsx`

```jsx
import { ItemPhoto } from "../ItemPhoto/ItemPhoto.jsx";
import { NoteTag } from "../NoteTag/NoteTag.jsx";
import { PriorityStamp } from "../PriorityStamp/PriorityStamp.jsx";
import { Button } from "../Button/Button.jsx";

export function ItemCard({ title, price, note, url, image, imageHeight = 150, priority = false, mockLabel, ctaLabel = "See it in the shop" }) {
  return (
    <article className="hn-card">
      {priority ? <div className="hn-card__stamp"><PriorityStamp /></div> : null}
      <ItemPhoto src={image} alt={title} height={imageHeight} mockLabel={mockLabel} />
      <h3 className="hn-card__title">{title}</h3>
      {price ? <p className="hn-card__price">{price}</p> : null}
      {note ? <div className="hn-card__note"><NoteTag>{note}</NoteTag></div> : null}
      {url ? <div className="hn-card__cta"><Button full href={url}>{ctaLabel}</Button></div> : null}
    </article>
  );
}
```

---

## ItemRow

### Props — `ItemRow.d.ts`

```ts
export interface ItemRowProps {
  title: string;
  /** Price, shop, or the note — one quiet line. Clicking it opens the editor. */
  meta?: string;
  image?: string;
  /** Read-only here: shown as a stamp, but only set inside the open editor. */
  priority?: boolean;
  mockLabel?: string;
  /** Expand in place into the full editor. One row open at a time. */
  open?: boolean;
  note?: string;
  price?: string;
  url?: string;
  onOpen?: () => void;
  onTogglePriority?: () => void;
  onMore?: () => void;
  onChange?: (key: "title" | "note" | "price" | "url", value: string) => void;
  onRemove?: () => void;
  onDone?: () => void;
}
export declare function ItemRow(props: ItemRowProps): JSX.Element;
```

### Source — `ItemRow.jsx`

```jsx
import { ItemPhoto } from "../ItemPhoto/ItemPhoto.jsx";
import { PriorityStamp } from "../PriorityStamp/PriorityStamp.jsx";
import { ItemEditor } from "../ItemEditor/ItemEditor.jsx";

export function ItemRow({
  title, meta, image, priority = false, mockLabel,
  open = false, note, price, url,
  onOpen, onTogglePriority, onMore, onChange, onRemove, onDone
}) {
  if (open) {
    return (
      <ItemEditor
        title={title} note={note} price={price} url={url} image={image} mockLabel={mockLabel}
        priority={priority} onChange={onChange} onTogglePriority={onTogglePriority}
        onRemove={onRemove} onDone={onDone}
      />
    );
  }
  return (
    <div className="hn-row">
      <button className="hn-row__grip" aria-label="Reorder">⋮⋮</button>
      <ItemPhoto src={image} alt={title} height={72} mockLabel={mockLabel} />
      <button className="hn-row__open" onClick={onOpen} aria-expanded="false">
        <span className="hn-row__title">{title}</span>
        <span className="hn-row__meta">{meta}</span>
      </button>
      <span className="hn-row__flag">{priority ? <PriorityStamp flat>Really wants</PriorityStamp> : null}</span>
      <button className="hn-row__more" aria-label="More" onClick={onMore}>···</button>
    </div>
  );
}
```

---

## ItemEditor

### Props — `ItemEditor.d.ts`

```ts
export interface ItemEditorProps {
  title?: string;
  /** The note the giver reads — sizes, colours, "ask Mum". */
  note?: string;
  /** Approximate, optional. */
  price?: string;
  url?: string;
  image?: string;
  mockLabel?: string;
  priority?: boolean;
  notePlaceholder?: string;
  doneLabel?: string;
  removeLabel?: string;
  /** Pass to control the fields: (key, value) for title | note | price | url. Omit and the inputs are uncontrolled. */
  onChange?: (key: "title" | "note" | "price" | "url", value: string) => void;
  onTogglePriority?: () => void;
  onRemove?: () => void;
  onDone?: () => void;
}
export declare function ItemEditor(props: ItemEditorProps): JSX.Element;
```

### Source — `ItemEditor.jsx`

```jsx
import { ItemPhoto } from "../ItemPhoto/ItemPhoto.jsx";
import { Button } from "../Button/Button.jsx";

export function ItemEditor({
  title = "", note = "", price = "", url = "", image, mockLabel, priority = false,
  notePlaceholder = "Sizes, colour, which one — anything that helps.",
  doneLabel = "Done", removeLabel = "Remove",
  onChange, onTogglePriority, onRemove, onDone
}) {
  const controlled = typeof onChange === "function";
  const bind = (key, val) => controlled
    ? { value: val, onChange: (e) => onChange(key, e.target.value) }
    : { defaultValue: val };
  return (
    <div className="hn-edit">
      <div className="hn-edit__grid">
        <ItemPhoto src={image} alt={title} height={80} mockLabel={mockLabel} />
        <div className="hn-edit__fields">
          <label className="hn-field">
            <span className="hn-field__label">What is it</span>
            <input className="hn-input hn-input--title" placeholder="Wool socks, any colour" {...bind("title", title)} />
          </label>
          <label className="hn-field">
            <span className="hn-field__label">Note</span>
            <textarea className="hn-input hn-input--note" rows={2} placeholder={notePlaceholder} {...bind("note", note)} />
          </label>
          <div className="hn-edit__pair">
            <label className="hn-field">
              <span className="hn-field__label">Roughly</span>
              <input className="hn-input" placeholder="649 kr" {...bind("price", price)} />
            </label>
            <label className="hn-field">
              <span className="hn-field__label">Link</span>
              <input className="hn-input" placeholder="Optional — paste a shop link" {...bind("url", url)} />
            </label>
          </div>
          <div className="hn-edit__actions">
            <button type="button" aria-pressed={priority} onClick={onTogglePriority}
              className={"hn-toggle" + (priority ? " is-on" : "")}>Really wants this</button>
            <span className="hn-edit__spacer"></span>
            <button type="button" className="hn-remove" onClick={onRemove}>{removeLabel}</button>
            <Button variant="primary" onClick={onDone}>{doneLabel}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## ListRow

### Props — `ListRow.d.ts`

```ts
export interface ListRowProps {
  /** List name — "My birthday", "Ellen, age 7". */
  name: string;
  /** "5 things · shared with 6 people", or "Nothing here yet". */
  meta?: string;
  href?: string;
}
export declare function ListRow(props: ListRowProps): JSX.Element;
```

### Source — `ListRow.jsx`

```jsx
export function ListRow({ name, meta, href = "#" }) {
  return (
    <a className="hn-lrow" href={href}>
      <span className="hn-lrow__text">
        <span className="hn-lrow__name">{name}</span>
        <span className="hn-lrow__meta">{meta}</span>
      </span>
      <span className="hn-lrow__arrow" aria-hidden="true">→</span>
    </a>
  );
}
```

---

## PasteBar

### Props — `PasteBar.d.ts`

```ts
import * as React from "react";
export interface PasteBarProps {
  placeholder?: string;
  buttonLabel?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit?: () => void;
}
export declare function PasteBar(props: PasteBarProps): JSX.Element;
```

### Source — `PasteBar.jsx`

```jsx
import { Button } from "../Button/Button.jsx";

export function PasteBar({ placeholder = "Paste a link, or just type what you want…", buttonLabel = "Add", value, onChange, onSubmit }) {
  return (
    <div className="hn-paste">
      <input className="hn-paste__input" aria-label="Add an item" placeholder={placeholder} value={value} onChange={onChange} />
      <Button variant="primary" onClick={onSubmit}>{buttonLabel}</Button>
    </div>
  );
}
```

---

## ListNav

### Props — `ListNav.d.ts`

```ts
export interface ListNavProps {
  brand?: string;
  label?: string;
  /** List names, in the owner's order. */
  items?: string[];
  /** Index of the open list. */
  current?: number;
  newLabel?: string;
  onSelect?: () => void;
}
export declare function ListNav(props: ListNavProps): JSX.Element;
```

### Source — `ListNav.jsx`

```jsx
import { Wordmark } from "../Wordmark/Wordmark.jsx";

export function ListNav({ brand = "Hinted", label = "Your lists", items = [], current = 0, newLabel = "+ New list", onSelect }) {
  return (
    <nav className="hn-nav">
      <div className="hn-nav__brand"><Wordmark name={brand} size={30} /></div>
      <div className="hn-label hn-nav__label">{label}</div>
      {items.map((it, i) => (
        <a key={i} href="#" className={"hn-nav__item" + (i === current ? " is-current" : "")} onClick={onSelect}>{it}</a>
      ))}
      <a href="#" className="hn-nav__item hn-nav__item--new">{newLabel}</a>
    </nav>
  );
}
```
