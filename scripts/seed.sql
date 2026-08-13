-- Demo data matching the design mockups (docs/design/hinted/mockups/).
-- Idempotent AND non-destructive: ON CONFLICT upserts (never INSERT OR
-- REPLACE — SQLite REPLACE deletes the conflicting row first, which would
-- cascade-delete the demo user's lists/items). Applied locally with
-- `pnpm db:seed`; to prod (demo list only) with
-- `wrangler d1 execute wishlist-db --remote --file=./scripts/seed.sql`.

INSERT INTO users (id, email, name, created_at)
VALUES (1, 'sofie@example.com', 'Sofie Demo', unixepoch())
ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name;

INSERT INTO lists (id, user_id, name, occasion_label, intro, slug, position, created_at, updated_at)
VALUES (1, 1, 'Sofie''s birthday', 'Birthday', 'A few things I''d love. No rush, no pressure — just hints.',
        'demolist0000000000000A', 0, unixepoch(), unixepoch())
ON CONFLICT (id) DO UPDATE SET
  user_id = excluded.user_id, name = excluded.name, occasion_label = excluded.occasion_label,
  intro = excluded.intro, slug = excluded.slug, position = excluded.position, updated_at = unixepoch();

INSERT INTO items (id, list_id, title, note, price, url, image_url, priority, position, created_at, updated_at) VALUES
(1, 1, 'Wool socks, any colour', 'Size 38–39. The thick ribbed kind.', NULL, NULL, NULL, 1, 0, unixepoch(), unixepoch()),
(2, 1, 'Cast iron skillet, 26 cm', NULL, 'About 649 kr', 'https://example.com/skillet', NULL, 0, 1, unixepoch(), unixepoch()),
(3, 1, 'Speckled ceramic mug', 'The pale grey one', 'About 180 kr', NULL, NULL, 0, 2, unixepoch(), unixepoch()),
(4, 1, 'A poetry collection', 'Any of hers I don''t have — ask Mum, she knows.', NULL, NULL, NULL, 0, 3, unixepoch(), unixepoch()),
(5, 1, 'Gardening gloves', 'Medium. Leather palms if possible.', NULL, NULL, NULL, 0, 4, unixepoch(), unixepoch())
ON CONFLICT (id) DO UPDATE SET
  list_id = excluded.list_id, title = excluded.title, note = excluded.note, price = excluded.price,
  url = excluded.url, image_url = excluded.image_url, priority = excluded.priority,
  position = excluded.position, updated_at = unixepoch();
