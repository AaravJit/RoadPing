-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Terms/EULA acceptance tracking + expanded report reasons
--
-- App Store rejection 06/2026 (Guideline 1.2 — User Generated Content) requires:
--   • Users must agree to Terms/EULA before registering or logging in.
--   • The acceptance must be recorded.
--   • Report reasons must cover objectionable content (hate, threats, etc.).
--
-- Privacy / safety notes:
--   • Acceptance columns live on profiles; the existing
--     "profiles: user updates own row" RLS policy already lets a user write
--     their own accepted_terms_* fields (it only locks is_banned /
--     is_shadow_banned), so no new policy is needed.
--   • New report_reason enum values are additive and safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Terms/EULA acceptance on profiles ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms_at      timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text
    CHECK (accepted_terms_version IS NULL OR char_length(accepted_terms_version) <= 40);

COMMENT ON COLUMN public.profiles.accepted_terms_at IS
  'When the user last accepted the Terms of Use / EULA. NULL = never accepted.';
COMMENT ON COLUMN public.profiles.accepted_terms_version IS
  'Version string of the Terms the user accepted. Re-prompt when this differs '
  'from the current app TERMS_VERSION.';

-- ── 2. Expanded report reasons (objectionable-content coverage) ──────────────
-- ALTER TYPE ... ADD VALUE is additive and idempotent via IF NOT EXISTS (PG12+).
ALTER TYPE public.report_reason ADD VALUE IF NOT EXISTS 'threats';
ALTER TYPE public.report_reason ADD VALUE IF NOT EXISTS 'hate_or_discrimination';
