-- pgTAP: schema from 20260609000010_terms_and_report_reasons, which production
-- applied before it was on main. Guards against the drift recurring.
BEGIN;
SELECT plan(3);

SELECT has_column('public', 'profiles', 'accepted_terms_at',
  'profiles.accepted_terms_at exists');
SELECT has_column('public', 'profiles', 'accepted_terms_version',
  'profiles.accepted_terms_version exists');
SELECT enum_has_labels('public', 'report_reason',
  ARRAY['harassment', 'inappropriate_content', 'spam', 'impersonation',
        'dangerous_driving', 'other', 'threats', 'hate_or_discrimination'],
  'report_reason includes threats and hate_or_discrimination');

SELECT * FROM finish();
ROLLBACK;
