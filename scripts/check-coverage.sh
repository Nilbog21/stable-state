#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "Running coverage..."
npm run test:coverage

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
const uncoveredFiles = [];

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
    uncoveredFiles.push({ relPath, lines });
  }
}

if (uncoveredFiles.length > 0) {
  console.error('Coverage check FAILED — uncovered lines:');
  for (const { relPath, lines } of uncoveredFiles) {
    console.error(\`  \${relPath}: lines \${lines}\`);
  }
  process.exit(1);
}

console.log('Coverage check PASSED — all src lines are covered.');
"
