#!/bin/bash
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [[ "$tool" != "Write" && "$tool" != "Edit" ]]; then
  exit 0
fi

if [[ "$file_path" == *test* ]] || [[ "$file_path" == *spec* ]]; then
  cwd=$(echo "$input" | jq -r '.cwd // empty')
  cd "$cwd" && npx vitest run --reporter=verbose 2>&1 | head -50
fi
