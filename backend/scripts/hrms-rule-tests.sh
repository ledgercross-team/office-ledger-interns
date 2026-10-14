#!/usr/bin/env bash
# Runs docs/hrms/hrms_rule_tests.sql against a THROWAWAY database only.
# The tests add sample data and change plan limits. The target database name must end in
# "_throwaway" or "_test", and must not be the real office_ledger_hrms.
#
#   backend/scripts/hrms-rule-tests.sh <dbname> [psql connection args...]
set -euo pipefail

db="${1:-}"
shift || true
if [[ ! "$db" =~ _(throwaway|test)$ ]]; then
  echo "REFUSING: '$db' is not a throwaway database (name must end in _throwaway or _test)." >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
psql -v ON_ERROR_STOP=0 -d "$db" "$@" -f "$root/docs/hrms/hrms_rule_tests.sql"
