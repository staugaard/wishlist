-- Deterministic local seed data. Applied with: pnpm db:seed
INSERT OR REPLACE INTO app_meta (key, value, updated_at)
VALUES ('seeded', 'true', unixepoch());
