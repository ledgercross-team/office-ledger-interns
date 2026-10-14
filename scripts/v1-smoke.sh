#!/usr/bin/env bash
# v1 smoke check: logs in as the seeded demo admin, manager and employee and prints
# the HTTP status plus the field names (never values) of a few key responses.
# Needs the API running and `pnpm db:seed` applied. Reads SEED_DEMO_PASSWORD from the
# environment, or from backend/.env.local.
set -u

BASE_URL="${BASE_URL:-http://localhost:4000/api/v1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${SEED_DEMO_PASSWORD:-}" ] && [ -f "$ROOT/backend/.env.local" ]; then
  SEED_DEMO_PASSWORD="$(grep -E '^SEED_DEMO_PASSWORD=' "$ROOT/backend/.env.local" | head -1 | cut -d= -f2-)"
fi
if [ -z "${SEED_DEMO_PASSWORD:-}" ]; then
  echo "SEED_DEMO_PASSWORD is not set" >&2
  exit 2
fi

JAR_DIR="$(mktemp -d)"
trap 'rm -rf "$JAR_DIR"' EXIT

# Prints the sorted top-level field names of a JSON body; for objects with a single
# array or object value (items, user) it also lists the first element's fields.
fields() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const v = JSON.parse(s);
        const keys = (o) => Object.keys(o).sort().join(",");
        if (Array.isArray(v)) return console.log("array[" + (v[0] && typeof v[0] === "object" ? keys(v[0]) : "") + "]");
        const out = [keys(v)];
        for (const k of Object.keys(v).sort()) {
          const x = v[k];
          if (Array.isArray(x) && x[0] && typeof x[0] === "object") out.push(k + "[]:" + keys(x[0]));
          else if (x && typeof x === "object" && !Array.isArray(x)) out.push(k + "{}:" + keys(x));
        }
        console.log(out.join(" | "));
      } catch { console.log("(no json)"); }
    });'
}

call() {
  local jar="$1" method="$2" path="$3" body="${4:-}" out status
  out="$JAR_DIR/body.json"
  if [ -n "$body" ]; then
    status="$(curl -s -o "$out" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" \
      -H 'Content-Type: application/json' -d "$body" "$BASE_URL$path")"
  else
    status="$(curl -s -o "$out" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" "$BASE_URL$path")"
  fi
  printf '%-4s %-28s %s  %s\n' "$method" "$path" "$status" "$(fields < "$out")"
}

run_role() {
  local label="$1" email="$2"; shift 2
  local jar="$JAR_DIR/$label.jar"
  echo "== $label ($email)"
  call "$jar" POST /auth/login "{\"email\":\"$email\",\"password\":\"$SEED_DEMO_PASSWORD\"}"
  for path in "$@"; do
    call "$jar" GET "$path"
  done
}

echo "BASE_URL=$BASE_URL"
run_role admin    admin@acme.local     /auth/me /dashboard/summary '/tasks?pageSize=5' '/users?pageSize=5' /company/subscription
run_role manager  manager1@acme.local  /auth/me /dashboard/summary '/tasks?pageSize=5' '/users?pageSize=5' /attendance/me
run_role employee employee1@acme.local /auth/me /dashboard/summary '/tasks?pageSize=5' /attendance/me
