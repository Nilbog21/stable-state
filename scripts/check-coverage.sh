#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ "${SKIP_COVERAGE_RUN:-0}" = "1" ]; then
  echo "Skipping test run (SKIP_COVERAGE_RUN=1). Ensure coverage JSON is current."
  if [ ! -f "coverage/coverage-final.json" ]; then
    echo "Error: coverage/coverage-final.json not found. Run tests first." >&2
    exit 1
  fi
else
  echo "Running coverage..."
  npm run test:coverage
fi

echo ""
node -e "
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const coverageFile = path.join(cwd, 'coverage/coverage-final.json');

if (!fs.existsSync(coverageFile)) {
  console.error('coverage/coverage-final.json not found.');
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
const uncoveredLineFiles = [];
const uncoveredBranchFiles = [];

for (const [filePath, data] of Object.entries(coverage)) {
  const relPath = filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;

  const uncoveredLines = new Set();
  for (const [stmtId, count] of Object.entries(data.s)) {
    if (count === 0) {
      const loc = data.statementMap[stmtId];
      if (loc) {
        for (let line = loc.start.line; line <= loc.end.line; line++) {
          uncoveredLines.add(line);
        }
      }
    }
  }
  if (uncoveredLines.size > 0) {
    const lines = [...uncoveredLines].sort((a, b) => a - b).join(', ');
    uncoveredLineFiles.push({ relPath, lines });
  }

  const uncoveredBranchLines = new Set();
  for (const [branchId, counts] of Object.entries(data.b)) {
    const branchInfo = data.branchMap[branchId];
    counts.forEach((count, i) => {
      if (count === 0) {
        // Istanbul uses locations[] for if/switch arms and loc for ternary/logical;
        // the fallback reports the branch origin line, which may be off for some arm styles.
        const loc = branchInfo?.locations?.[i] ?? branchInfo?.loc;
        if (loc?.start?.line) uncoveredBranchLines.add(loc.start.line);
      }
    });
  }
  if (uncoveredBranchLines.size > 0) {
    const lines = [...uncoveredBranchLines].sort((a, b) => a - b).join(', ');
    uncoveredBranchFiles.push({ relPath, lines });
  }
}

let failed = false;

if (uncoveredLineFiles.length > 0) {
  console.error('Coverage check FAILED — uncovered lines:');
  for (const { relPath, lines } of uncoveredLineFiles) {
    console.error(\`  \${relPath}: lines \${lines}\`);
  }
  failed = true;
}

if (uncoveredBranchFiles.length > 0) {
  console.error('Coverage check FAILED — uncovered branches:');
  for (const { relPath, lines } of uncoveredBranchFiles) {
    console.error(\`  \${relPath}: lines \${lines}\`);
  }
  failed = true;
}

if (failed) process.exit(1);

console.log('Coverage check PASSED — all src lines and branches are covered.');
"
