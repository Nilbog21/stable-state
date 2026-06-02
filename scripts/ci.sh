#!/usr/bin/env bash
set -euo pipefail

npm run test:coverage
SKIP_COVERAGE_RUN=1 bash scripts/check-coverage.sh
bash scripts/check-coverage.test.sh
