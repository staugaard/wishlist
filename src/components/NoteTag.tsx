import type { Child } from "hono/jsx";

export function NoteTag({
  label = "Note",
  children,
}: {
  label?: string;
  children?: Child;
}) {
  return (
    <div class="hn-note">
      <span class="hn-note__label">{label}</span>
      <p class="hn-note__text">{children}</p>
    </div>
  );
}
