#!/usr/bin/env bash
# Runs every migration plus the pgTAP tests in supabase/tests/database against
# a scratch database on a plain Postgres (needs PostGIS, pg_cron preloaded and
# pgTAP installed). With the Supabase CLI and Docker, prefer `supabase test db`.
#
#   PGHOST=/tmp PGPORT=54399 PGUSER=postgres scripts/db-test/run.sh
#
# Set ROLLBACK_CHECK=1 to also apply the rollback script of the latest
# migration, run the tests that do not depend on it (they must still pass on
# the rolled-back schema), then re-apply the migration and run everything
# again. CONCURRENCY_CHECK=0 skips scripts/db-test/concurrency.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_NAME:-roadping_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

dropdb --if-exists --force "$DB"
createdb "$DB"

"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/db-test/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -c 'CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;'

run_tests() {
  local failed=0 out skip="${1:-}"
  for t in "$ROOT"/supabase/tests/database/*.sql; do
    if [[ -n "$skip" ]] && grep -q "$skip" "$t"; then
      echo "skip: $(basename "$t") (needs $skip)"
      continue
    fi
    echo "test: $(basename "$t")"
    out="$(PGOPTIONS='--search_path=public,extensions' "${PSQL[@]}" -d "$DB" -t -A -f "$t")"
    grep -E '^(ok|not ok|#)' <<<"$out" || true
    if grep -qE '^not ok|^# Looks like' <<<"$out"; then failed=1; fi
  done
  return "$failed"
}

run_tests

if [[ "${CONCURRENCY_CHECK:-1}" == "1" ]]; then
  echo "concurrency: concurrency.sh"
  DB_NAME="$DB" "$ROOT/scripts/db-test/concurrency.sh"
fi

if [[ "${ROLLBACK_CHECK:-0}" == "1" ]]; then
  latest="$(ls "$ROOT"/supabase/migrations/*.sql | tail -1)"
  down="$ROOT/supabase/rollback/$(basename "$latest" .sql).down.sql"
  echo "rollback: $(basename "$down")"
  "${PSQL[@]}" -d "$DB" -f "$down"
  run_tests "$(basename "$latest" .sql)"
  echo "re-apply: $(basename "$latest")"
  "${PSQL[@]}" -d "$DB" -f "$latest"
  run_tests
fi
