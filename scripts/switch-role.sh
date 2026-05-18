#!/usr/bin/env bash
# Dev-only: switch your barn_memberships role without needing multiple Google accounts.
# Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (or exported in the shell).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
USER_EMAIL="aseefried@gmail.com"

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

AUTH=(-H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY")

# Resolve user ID
echo "Looking up $USER_EMAIL..."
USER_ID=$(curl -sf "${AUTH[@]}" "${SUPABASE_URL}/auth/v1/admin/users?per_page=100" \
  | jq -r --arg email "$USER_EMAIL" '.users[] | select(.email == $email) | .id')

if [[ -z "$USER_ID" ]]; then
  echo "User not found. Sign in with Google at least once first." >&2; exit 1
fi

# Fetch barns
BARNS=$(curl -sf "${AUTH[@]}" "${SUPABASE_URL}/rest/v1/barns?select=id,name&order=name")
mapfile -t BARN_IDS   < <(echo "$BARNS" | jq -r '.[].id')
mapfile -t BARN_NAMES < <(echo "$BARNS" | jq -r '.[].name')

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
if $NEEDS_BARN; then
  if [[ ${#BARN_IDS[@]} -eq 0 ]]; then
    echo "No barns found. Create one in Supabase Studio first." >&2; exit 1
  fi

  echo ""
  echo "Select a barn:"
  for i in "${!BARN_IDS[@]}"; do
    printf "  %d) %s\n" $((i + 1)) "${BARN_NAMES[$i]}"
  done
  echo ""
  read -rp "Choice [1-${#BARN_IDS[@]}]: " BARN_CHOICE
  BARN_IDX=$((BARN_CHOICE - 1))

  if [[ $BARN_IDX -lt 0 || $BARN_IDX -ge ${#BARN_IDS[@]} ]]; then
    echo "Invalid choice." >&2; exit 1
  fi

  BARN_ID_JSON="\"${BARN_IDS[$BARN_IDX]}\""
  BARN_LABEL=" @ ${BARN_NAMES[$BARN_IDX]}"
fi

# Replace membership (delete-then-insert to avoid constraint edge cases)
echo ""
echo "Updating membership..."
curl -sf -X DELETE "${AUTH[@]}" \
  "${SUPABASE_URL}/rest/v1/barn_memberships?user_id=eq.${USER_ID}" > /dev/null

curl -sf -X POST "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"user_id\":\"${USER_ID}\",\"barn_id\":${BARN_ID_JSON},\"role\":\"${ROLE}\",\"status\":\"${STATUS}\"}" \
  "${SUPABASE_URL}/rest/v1/barn_memberships" > /dev/null

echo "Done: ${ROLE}${BARN_LABEL} (${STATUS})"
echo "Sign out and back in for the change to take effect."
