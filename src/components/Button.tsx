import type { Child } from "hono/jsx";

export function Button({
  children,
  variant = "outline",
  full = false,
  href,
  type = "button",
}: {
  children?: Child;
  /** Visual weight. Use `primary` once per screen. */
  variant?: "outline" | "primary" | "accent" | "quiet";
  /** Stretch to the container width — the phone card CTA. */
  full?: boolean;
  href?: string;
  type?: "button" | "submit";
}) {
  const cls = ["hn-btn", `hn-btn--${variant}`, full ? "hn-btn--full" : ""]
    .filter(Boolean)
    .join(" ");
  if (href) {
    return (
      <a class={cls} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button class={cls} type={type}>
      {children}
    </button>
  );
}
