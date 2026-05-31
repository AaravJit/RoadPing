-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Add default_range_m to profiles
--
-- Stores the user's preferred broadcast radius (set during profile setup).
-- The live-session Edge Function uses this as the default range_m when the
-- client does not send an explicit override.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_range_m integer NOT NULL DEFAULT 2000
    CHECK (default_range_m BETWEEN 100 AND 5000);

COMMENT ON COLUMN public.profiles.default_range_m IS
  'User-chosen default broadcast radius in metres (100–5000). '
  'Set during profile setup; used as the default when starting a live session.';
