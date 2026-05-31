-- ═══════════════════════════════════════════════════════════════════════════
-- 009 — reports: anonymize reporter on account deletion
--
-- Apple App Review wants:
--   • account deletion available in-app
--   • reports retained for moderation/safety
--
-- Previously reports.reporter_id was NOT NULL and ON DELETE CASCADE, so a
-- user deleting their account also wiped every report they ever filed —
-- which is bad for safety/moderation history.
--
-- After this migration:
--   • reporter_id is NULLABLE
--   • on user deletion, reporter_id is set to NULL (report row stays)
--   • reported_user_id keeps CASCADE — if the reported user is gone, the
--     report has nothing to act on and is safe to drop.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.reports
  ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reporter_id_fkey
    FOREIGN KEY (reporter_id)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

-- The reports_no_self_report constraint compares reporter_id to
-- reported_user_id. With reporter_id nullable, NULL != x is NULL (unknown),
-- which makes the CHECK pass — the constraint stays valid without changes.

COMMENT ON COLUMN public.reports.reporter_id IS
  'Null = reporter deleted their account. Report retained for moderation.';
