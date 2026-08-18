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
# leave a silent hole the moment a covered page started importing a new module.
#
# src/components/** and src/app/actions/** are here for the same reason and were learned the
# hard way (#1281): the list carried only src/components/ui/**, and three slices in two days
# lost coverage through the gap — calendar/**, documents/**, ExhaustionBar.tsx,
# useOutsideDismiss.ts. A module reached through a *shared helper* is exactly the one an
# author forgets their spec drives, so it can't be left to per-spec declaration.
#
# scripts/run-checklist-suite.sh is here for the same reason playwright.config.ts is (#1607). It
# cannot reach a browser, and #1550's principle — a file that cannot reach a browser cannot be the
# reason to open one — therefore does not separate the two; what settles it is that the runner
# governs strictly more than the config does: the origin every spec is pointed at, the env every
# spec reads, and since #1601 whether a production server exists at all. Before this entry a diff
# that rewrote that file returned mode=none, because no spec's covers: globs declare scripts/
# either — so the one file whose blast radius is the whole suite was the one file a change to which
# ran nothing.
#
# scripts/e2e-slot.sh is deliberately **not** here, and the omission is load-bearing rather than an
# oversight: it decides whether runs serialise, never what any spec asserts, and it already carries
# e2e-slot.test.sh in ci.sh. #1598's own de-escalation off mode=full rests on exactly that
# distinction. select-specs.test.sh asserts both directions, so neither is left to this comment.
ALWAYS_FULL=(
  'e2e/support/**'
  'e2e/global-setup.ts'
  'playwright.config.ts'
  'scripts/run-checklist-suite.sh'
  'src/proxy.ts'
  'src/app/layout.tsx'
  'src/app/barn/[slug]/(protected)/layout.tsx'
  'src/app/actions/**'
  'src/components/**'
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

# Read once and share: --lint was re-running it per glob, and the stdin path below needs
# the same list to tell "nothing declares this" from "this doesn't exist".
tracked_paths=$(git ls-files)

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
      done <<< "$tracked_paths"
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

# Ahead of any mode decision, so it lands on mode=full and mode=scoped runs too. mode=none
# is the ambiguous one — it reads identically for "no spec declares this module" and "this
# path does not exist", and #1281 shipped a coverage claim built on the second read.
for path in "${changed[@]+"${changed[@]}"}"; do
  if ! grep -qxF -- "$path" <<< "$tracked_paths"; then
    echo "select-specs.sh: warning: '$path' matches no tracked path — deleted in this diff, or a typo. mode=none means 'no spec declares it', not 'it does not exist'." >&2
  fi
done

# A file that cannot reach a browser cannot be the reason to open one (#1550). ALWAYS_FULL's
# /** entries are literal prefixes with no extension filter, so `src/components/ui/CLAUDE.md`
# — a doc — escalated to all 73 specs, and so did every TDD run's opening `__tests__` commit,
# the most common diff shape in this repo. Consulted for the escalation decision only: a
# non-runtime path still falls through to per-spec `covers:` matching below, so a spec that
# genuinely wants to declare a fixture or doc keeps saying so and keeps being selected.
is_non_runtime() {
  local path="$1"
  case "$path" in
    *.md | *.test.ts | *.test.tsx | */__tests__/*) return 0 ;;
    *) return 1 ;;
  esac
}

for path in "${changed[@]+"${changed[@]}"}"; do
  is_non_runtime "$path" && continue
  for glob in "${ALWAYS_FULL[@]}"; do
    if path_matches "$path" "$glob"; then
      # On stderr, and stdout stays `mode=full` alone: three skills parse this output as
      # key=value lines, so a fourth line there is a contract change (asserted by test 20).
      # #1550 — `mode=full` used to print with no indication of *which* path escalated, so
      # confirming a 73-spec run was warranted meant reading ALWAYS_FULL against the diff by
      # hand. Nobody did, and a markdown file bought a full suite more than once.
      echo "select-specs.sh: mode=full because '$path' matches always-full glob '$glob'" >&2
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
