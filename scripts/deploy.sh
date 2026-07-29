#!/usr/bin/env bash
# Deploys Shop Board to Vercel with a hosted Turso database.
#
# Does everything except the two logins that need to be you: signing in to
# Turso and to Vercel, both of which open a browser window.
#
#   npm run deploy              # do it
#   npm run deploy -- --dry-run # show what it would do, touch nothing
#
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${SHOP_DB_NAME:-shop-board}"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

run() {
  if $DRY_RUN; then
    printf '  would run: %s\n' "$*"
  else
    "$@"
  fi
}

# ── 0. Prerequisites ─────────────────────────────────────────────────────────
command -v node >/dev/null || fail "Node.js isn't installed. Get it from https://nodejs.org and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || fail "Node 20 or newer is needed (you have $(node -v))."

bold "Shop Board → Vercel"
info "Two browser logins will be needed: Turso (the database) and Vercel (the hosting)."
$DRY_RUN && info "DRY RUN — nothing will actually be created."

# ── 1. Database (Turso) ──────────────────────────────────────────────────────
bold "1. Database"

if ! command -v turso >/dev/null; then
  info "The Turso CLI isn't installed."
  read -r -p "  Install it now? (y/N) " answer || answer=""
  if [[ "${answer,,}" == "y" ]]; then
    run bash -c 'curl -sSfL https://get.tur.so/install.sh | bash'
    export PATH="$HOME/.turso:$PATH"
  fi
fi

if command -v turso >/dev/null && ! $DRY_RUN; then
  turso auth whoami >/dev/null 2>&1 || turso auth login
  if turso db show "$DB_NAME" >/dev/null 2>&1; then
    info "Reusing the existing '$DB_NAME' database."
  else
    info "Creating the '$DB_NAME' database…"
    turso db create "$DB_NAME"
  fi
  DB_URL="$(turso db show "$DB_NAME" --url)"
  DB_TOKEN="$(turso db tokens create "$DB_NAME")"
  info "Database ready: $DB_URL"
else
  # No CLI (or dry run): fall back to pasting the two values from the dashboard.
  info "Create a database at https://turso.tech (free, no card), then paste its details."
  read -r -p "  Database URL (libsql://…): " DB_URL || DB_URL=""
  read -r -s -p "  Database token: " DB_TOKEN || DB_TOKEN=""
  echo
  $DRY_RUN && { DB_URL="${DB_URL:-libsql://example.turso.io}"; DB_TOKEN="${DB_TOKEN:-example-token}"; }
fi

[[ -n "${DB_URL:-}" && -n "${DB_TOKEN:-}" ]] || fail "Need both a database URL and a token to continue."

# ── 2. Sign-in secret and timezone ───────────────────────────────────────────
bold "2. Settings"

JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
info "Generated a sign-in secret (SHOP_JWT_SECRET)."

DETECTED_TZ="$(node -p 'Intl.DateTimeFormat().resolvedOptions().timeZone' 2>/dev/null || echo 'America/Chicago')"
read -r -p "  Shop timezone [$DETECTED_TZ]: " SHOP_TZ || SHOP_TZ=""
SHOP_TZ="${SHOP_TZ:-$DETECTED_TZ}"
info "Using $SHOP_TZ — every date in the app keys off this. Changeable later in the app."

# ── 3. Deploy (Vercel) ───────────────────────────────────────────────────────
bold "3. Deploy"

VERCEL="npx --yes vercel@latest"

if ! $DRY_RUN; then
  $VERCEL whoami >/dev/null 2>&1 || $VERCEL login
  # --yes accepts the defaults for a project that isn't linked yet.
  $VERCEL link --yes >/dev/null
fi

set_env() {
  local name="$1" value="$2"
  if $DRY_RUN; then
    printf '  would set %s for production\n' "$name"
    return
  fi
  # Replace any existing value so re-running this script is safe.
  $VERCEL env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | $VERCEL env add "$name" production >/dev/null
  info "set $name"
}

set_env TURSO_DATABASE_URL "$DB_URL"
set_env TURSO_AUTH_TOKEN "$DB_TOKEN"
set_env SHOP_JWT_SECRET "$JWT_SECRET"
set_env SHOP_TZ "$SHOP_TZ"

if $DRY_RUN; then
  printf '  would run: %s deploy --prod\n' "$VERCEL"
  bold "Dry run finished — nothing was created."
  exit 0
fi

bold "Building…"
URL="$($VERCEL deploy --prod)"

# ── 4. Check it came up ──────────────────────────────────────────────────────
bold "Deployed"
info "$URL"

HEALTH="$(curl -fsS --max-time 20 "$URL/api/health" 2>/dev/null || echo '')"
if [[ -n "$HEALTH" ]]; then
  info "health: $HEALTH"
  case "$HEALTH" in
    *'"database":"hosted"'*) info "Database is wired up correctly." ;;
    *) info "WARNING: not using the hosted database — check the environment variables in Vercel." ;;
  esac
else
  info "Couldn't reach /api/health yet. Give it a few seconds and open $URL/api/health."
fi

bold "Next"
info "1. Open $URL and create your manager account (name + a 4–8 digit PIN)."
info "2. Add your staff: your initials, top right → Manage shop → Team."
info "3. On each person's phone: open the URL, then Share → Add to Home Screen."
echo
