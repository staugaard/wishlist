import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Deliberately not a product table: a key/value store used by /healthz to
// prove the full migration → binding → query loop works. Product schema
// starts when product work starts.
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
