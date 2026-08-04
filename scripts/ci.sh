#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npm run lint -- --max-warnings 0
npx tsc --noEmit -p tsconfig.json
npm run test:coverage
SKIP_COVERAGE_RUN=1 bash scripts/check-coverage.sh
bash scripts/check-coverage.test.sh
bash scripts/check-doc-size.sh
bash scripts/check-doc-size.test.sh
bash scripts/select-specs.sh --lint
bash scripts/select-specs.test.sh
bash scripts/assert-dev-project.test.sh
