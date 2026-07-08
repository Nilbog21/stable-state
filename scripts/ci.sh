#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npm run lint -- --max-warnings 0
npm run test:coverage
SKIP_COVERAGE_RUN=1 bash scripts/check-coverage.sh
bash scripts/check-coverage.test.sh
