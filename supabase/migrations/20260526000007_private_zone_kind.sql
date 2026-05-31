-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007 — add `kind` to private_zones
--
-- Adds a zone category (home / work / custom) for better UI labelling.
-- Defaults to 'custom' for any existing rows.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.private_zones
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom'
    CHECK (kind IN ('home', 'work', 'custom'));

COMMENT ON COLUMN public.private_zones.kind IS
  'UI category: home | work | custom. Affects icon displayed to owner only.';
