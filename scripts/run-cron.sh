#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npx tsx "scripts/$1.ts"
