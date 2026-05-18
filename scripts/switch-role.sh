#!/usr/bin/env bash
# Dev-only: switch your barn_memberships role without needing multiple Google accounts.
# Required in .env.local (or exported in the shell):
#   DEV_USER_EMAIL         — your Supabase auth email
#   DEV_BARN_SLUG          — slug of the barn to operate on (not required for admin role)
#   SUPABASE_SERVICE_ROLE_KEY
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

# Load vars from .env.local
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# || -z "$key" ]] && continue
    value="${value%\"}" value="${value#\"}"
    export "$key=$value"
  done < "$ENV_FILE"
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
if [[ -z "$SUPABASE_URL" ]]; then
  echo "Error: NEXT_PUBLIC_SUPABASE_URL not found in .env.local" >&2; exit 1
fi

SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  read -rsp "Supabase service_role key (or add SUPABASE_SERVICE_ROLE_KEY to .env.local): " SERVICE_ROLE_KEY
  echo
fi

USER_EMAIL="${DEV_USER_EMAIL:-}"
if [[ -z "$USER_EMAIL" ]]; then
  echo "Error: DEV_USER_EMAIL not set. Add it to .env.local or export it in your shell." >&2; exit 1
fi

AUTH=(-H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY")

# Resolve user ID
echo "Looking up $USER_EMAIL..."
USER_ID=$(curl -sf "${AUTH[@]}" "${SUPABASE_URL}/auth/v1/admin/users?per_page=100" \
  | jq -r --arg email "$USER_EMAIL" '.users[] | select(.email == $email) | .id')

if [[ -z "$USER_ID" ]]; then
  echo "User not found. Sign in with Google at least once first." >&2; exit 1
fi

# Role menu
echo ""
echo "Select a role:"
echo "  1) admin     (global, no barn)"
echo "  2) manager   (barn-scoped, active)"
echo "  3) trainer   (barn-scoped, active)"
echo "  4) rider     (barn-scoped, active)"
echo "  5) rider     (barn-scoped, pending — tests approval flow)"
echo ""
read -rp "Choice [1-5]: " ROLE_CHOICE

case "$ROLE_CHOICE" in
  1) ROLE="admin";   STATUS="active"; NEEDS_BARN=false ;;
  2) ROLE="manager"; STATUS="active"; NEEDS_BARN=true  ;;
  3) ROLE="trainer"; STATUS="active"; NEEDS_BARN=true  ;;
  4) ROLE="rider";   STATUS="active"; NEEDS_BARN=true  ;;
  5) ROLE="rider";   STATUS="pending"; NEEDS_BARN=true ;;
  *) echo "Invalid choice." >&2; exit 1 ;;
esac

BARN_ID_JSON="null"
BARN_LABEL=""
# Default: scope delete to admin (null barn) memberships only
DELETE_FILTER="user_id=eq.${USER_ID}&barn_id=is.null"

if $NEEDS_BARN; then
  BARN_SLUG="${DEV_BARN_SLUG:-}"
  if [[ -z "$BARN_SLUG" ]]; then
    echo "Error: DEV_BARN_SLUG not set. Add it to .env.local or export it in your shell." >&2; exit 1
  fi

  BARN=$(curl -sf "${AUTH[@]}" "${SUPABASE_URL}/rest/v1/barns?select=id,name&slug=eq.${BARN_SLUG}")
  BARN_ID=$(echo "$BARN" | jq -r '.[0].id // empty')
  BARN_NAME=$(echo "$BARN" | jq -r '.[0].name // empty')

  if [[ -z "$BARN_ID" ]]; then
    echo "Error: Barn with slug '${BARN_SLUG}' not found." >&2; exit 1
  fi

  BARN_ID_JSON="\"${BARN_ID}\""
  BARN_LABEL=" @ ${BARN_NAME}"
  # Scope delete to this barn only, preserving memberships in other barns
  DELETE_FILTER="user_id=eq.${USER_ID}&barn_id=eq.${BARN_ID}"
fi

# Replace membership (delete-then-insert, scoped to this barn to preserve other memberships)
echo ""
echo "Updating membership..."
curl -sf -X DELETE "${AUTH[@]}" \
  "${SUPABASE_URL}/rest/v1/barn_memberships?${DELETE_FILTER}" > /dev/null

curl -sf -X POST "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"user_id\":\"${USER_ID}\",\"barn_id\":${BARN_ID_JSON},\"role\":\"${ROLE}\",\"status\":\"${STATUS}\"}" \
  "${SUPABASE_URL}/rest/v1/barn_memberships" > /dev/null

echo "Done: ${ROLE}${BARN_LABEL} (${STATUS})"
echo "Sign out and back in for the change to take effect."
