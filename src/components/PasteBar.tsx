export function PasteBar({
  action,
  placeholder = "Paste a link, or just type what you want…",
  buttonLabel = "Add",
}: {
  action: string;
  placeholder?: string;
  buttonLabel?: string;
}) {
  return (
    <form method="post" action={action} class="hn-paste">
      <input
        class="hn-paste__input"
        aria-label="Add an item"
        name="input"
        placeholder={placeholder}
        required
      />
      <button class="hn-btn hn-btn--primary" type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}
