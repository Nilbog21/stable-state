#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [[ "$file_path" == *.test.ts ]] || [[ "$file_path" == *.test.tsx ]] || [[ "$file_path" == *.spec.ts ]] || [[ "$file_path" == *.spec.tsx ]]; then
  cwd=$(echo "$input" | jq -r '.cwd // empty')
  cd "$cwd" && npx vitest run "$file_path" --reporter=verbose 2>&1
fi
