#!/usr/bin/env bash
# Picks the e2e specs a diff can plausibly break, so the workflow skills (/testIssue,
# /beginIssue, /reviewIssue) stop running the whole checklist suite for every change
# (#1213 — the old trigger was "did the diff touch e2e/?", which ran zero specs for a PR
# that rewrote a page and a full suite for one that touched a fixture).
#
#   gh pr diff --name-only | bash scripts/select-specs.sh
#   bash scripts/select-specs.sh --lint
#
# Emits workflow-context.sh-style key=value lines:
#   mode=full                    — a shared-infrastructure path changed; run everything
#   mode=scoped + spec=<path>…   — run exactly the listed specs
#   mode=none                    — nothing e2e-relevant changed; run no e2e at all
#
# Each spec declares what it exercises with `// covers:` lines at the top of the file, one
# glob per line. Accepted tradeoff: a mis-declared blast radius occasionally misses a
# regression, and that's worth the minutes saved on every other PR.
set -uo pipefail

# Stop rather than answer from whatever tree we happen to be standing in: three skills and
# ci.sh branch on this script's output, and a --lint that exits 0 having read no specs at
# all reads exactly like a clean one.
root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "select-specs.sh: not a git repository" >&2
  exit 1
}
cd "$root" || exit 1

# Paths whose blast radius is every spec, so no per-spec declaration could express it.
# The whole of src/lib/** is here rather than enumerated per spec — that layer is data
# access and shared formatting, both of which cut across every route. Enumerating it would
# put a near-identical eight-line DAL block on each of the six finances specs and still
# leave a silent hole the moment a covered page started importing a new module. With it
# here, every per-spec `covers:` declaration is a pure src/app/ route glob.
ALWAYS_FULL=(
  'e2e/support/**'
  'e2e/global-setup.ts'
  'playwright.config.ts'
  'src/proxy.ts'
  'src/app/layout.tsx'
  'src/app/barn/[slug]/(protected)/layout.tsx'
  'src/components/ui/**'
  'src/lib/**'
)

# Deliberately not bash's glob engine: `[slug]` in a route path is a bracket expression to
# it, so `[[ $path == $glob ]]` would match `src/app/barn/s/...` and miss the real path.
# A glob ending /** is a literal string prefix; anything else is an exact path.
path_matches() {
  local path="$1" glob="$2"
  if [[ $glob == *'/**' ]]; then
    [[ $path == "${glob%'**'}"* ]]
  else
    [[ $path == "$glob" ]]
  fi
}

covers_globs() {
  # Only the header block matters, but grepping the whole file costs nothing and survives
  # a spec that puts its declarations under a leading comment.
  sed -n 's|^// covers: *||p' "$1"
}

specs() {
  # A glob with no matches expands to itself under default bash; nullglob would need
  # setting and unsetting around this one call.
  ls e2e/*.spec.ts 2>/dev/null
}

if [[ ${1:-} == --lint ]]; then
  status=0
  while IFS= read -r spec; do
    globs=$(covers_globs "$spec")
    if [[ -z $globs ]]; then
      echo "Error: $spec has no '// covers:' line — every e2e spec must declare the source paths it exercises." >&2
      status=1
      continue
    fi
    while IFS= read -r glob; do
      matched=false
      while IFS= read -r tracked; do
        if path_matches "$tracked" "$glob"; then
          matched=true
          break
        fi
      done < <(git ls-files)
      if [[ $matched == false ]]; then
        echo "Error: $spec declares '// covers: $glob', which matches no tracked path — a rename left it pointing at nothing." >&2
        status=1
      fi
    done <<< "$globs"
  done < <(specs)
  exit "$status"
fi

if [[ $# -gt 0 ]]; then
  echo "Usage: gh pr diff --name-only | select-specs.sh   |   select-specs.sh --lint" >&2
  exit 1
fi

changed=()
# `|| [[ -n $line ]]` so a final line with no trailing newline isn't dropped — read returns
# non-zero on it, and losing it loses it toward mode=none.
while IFS= read -r line || [[ -n $line ]]; do
  [[ -n $line ]] && changed+=("$line")
done

for path in "${changed[@]+"${changed[@]}"}"; do
  for glob in "${ALWAYS_FULL[@]}"; do
    if path_matches "$path" "$glob"; then
      echo "mode=full"
      exit 0
    fi
  done
done

selected=()
while IFS= read -r spec; do
  for path in "${changed[@]+"${changed[@]}"}"; do
    # A changed spec selects itself — its own edit is the change under test.
    if [[ $path == "$spec" ]]; then
      selected+=("$spec")
      break
    fi
    hit=false
    while IFS= read -r glob; do
      if path_matches "$path" "$glob"; then
        hit=true
        break
      fi
    done < <(covers_globs "$spec")
    if [[ $hit == true ]]; then
      selected+=("$spec")
      break
    fi
  done
done < <(specs)

if [[ ${#selected[@]} -eq 0 ]]; then
  echo "mode=none"
  exit 0
fi

echo "mode=scoped"
printf 'spec=%s\n' "${selected[@]}"
