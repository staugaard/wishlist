import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Stored lowercase; normalize before insert/lookup.
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const lists = sqliteTable(
  "lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    occasionLabel: text("occasion_label"),
    // The owner's line under the list name on the public page.
    intro: text("intro"),
    // 16 random bytes, base64url (22 chars). The public URL is the share model.
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("lists_slug_idx").on(t.slug),
    index("lists_user_position_idx").on(t.userId, t.position),
  ],
);

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
    // Display text ("About 649 kr"), never numeric.
    price: text("price"),
    url: text("url"),
    // External URL in Phase 1; Phase 3 adds R2-backed storage.
    imageUrl: text("image_url"),
    priority: integer("priority", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("items_list_position_idx").on(t.listId, t.position)],
);
