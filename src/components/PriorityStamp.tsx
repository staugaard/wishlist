import type { Child } from "hono/jsx";

export function PriorityStamp({
  children = "Really wants this",
  flat = false,
}: {
  children?: Child;
  flat?: boolean;
}) {
  return (
    <span class={`hn-stamp${flat ? " hn-stamp--flat" : ""}`}>{children}</span>
  );
}
