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
bash scripts/check-e2e-tags.sh
bash scripts/check-e2e-tags.test.sh
bash scripts/check-pipefail-race.sh
bash scripts/check-pipefail-race.test.sh
bash scripts/check-function-grants.sh
bash scripts/check-function-grants.test.sh
bash scripts/check-ceremony-tags.sh
bash scripts/check-ceremony-tags.test.sh
bash scripts/workflow-context.test.sh
bash scripts/e2e-slot.test.sh
