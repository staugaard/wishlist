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

export const otpCodes = sqliteTable("otp_codes", {
  // Lowercase; one active code per address.
  email: text("email").primaryKey(),
  // SHA-256 of "<email>:<code>" — never the raw code.
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  // Wrong guesses against the current unexpired window. NOT reset by a
  // resend — that would multiply the brute-force budget.
  attempts: integer("attempts").notNull().default(0),
  // Emails sent in the current window (cap 3 while unexpired).
  sends: integer("sends").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

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
    // Source-provenance URL (and legacy fallback); our stored copy wins.
    imageUrl: text("image_url"),
    // R2 object key of our cached copy — preferred over imageUrl when set.
    imageKey: text("image_key"),
    priority: integer("priority", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("items_list_position_idx").on(t.listId, t.position)],
);
