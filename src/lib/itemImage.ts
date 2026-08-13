import type { items } from "../db/schema";
import { safeHttpUrl } from "./url";

type Item = typeof items.$inferSelect;

// Our R2 copy wins; the source URL is a legacy/provenance fallback.
export function itemImageSrc(item: Item): string | undefined {
  if (item.imageKey) return `/img/${item.imageKey}`;
  return safeHttpUrl(item.imageUrl);
}
