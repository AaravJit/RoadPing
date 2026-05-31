-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: PostgreSQL extensions
-- RoadPing requires PostGIS (geography types + proximity queries),
-- pgcrypto (gen_random_uuid), and pg_cron (scheduled session cleanup).
--
-- On Supabase hosted these run in the extensions schema.
-- If pg_cron fails, enable it manually:
--   Dashboard → Database → Extensions → pg_cron → Enable
-- ─────────────────────────────────────────────────────────────────────────────

-- PostGIS: extensions.geography(Point, 4326) columns + ST_DWithin proximity queries
CREATE EXTENSION IF NOT EXISTS postgis
  WITH SCHEMA extensions;

-- pgcrypto: gen_random_uuid() for primary keys
CREATE EXTENSION IF NOT EXISTS pgcrypto
  WITH SCHEMA extensions;

-- pg_cron: schedule expire_stale_sessions() every minute
-- Minimum interval is 1 minute — acceptable as a safety-net cleanup.
-- Mobile clients explicitly end sessions on stop/background (Phase 3).
CREATE EXTENSION IF NOT EXISTS pg_cron
  WITH SCHEMA extensions;

-- Expose pg_cron to the public search_path so cron.schedule() is reachable
-- from migration 004_rls.sql without the schema prefix.
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL  ON ALL TABLES IN SCHEMA cron TO postgres;
