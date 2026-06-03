#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

for cmd in ufw node npx systemd-inhibit; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found." >&2
    exit 1
  fi
done

cleanup() {
  echo "Closing UFW port 3000..."
  sudo ufw delete allow 3000/tcp
}
trap cleanup EXIT INT TERM

sudo ufw allow 3000/tcp

LAN_IP=$(hostname -I | awk '{print $1}')
if [[ -z "$LAN_IP" ]]; then
  read -rp "Could not detect LAN IP. Enter the IP address to use: " LAN_IP
  if [[ -z "$LAN_IP" ]]; then
    echo "Error: no IP address provided." >&2
    exit 1
  fi
fi
echo "Demo will be available at: http://${LAN_IP}:3000"

export NEXT_PUBLIC_SITE_URL="http://${LAN_IP}:3000"
npm run build

systemd-inhibit --what=idle:sleep --why="Demo in progress" \
  npx next start -H 0.0.0.0 -p 3000
