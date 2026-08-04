#!/usr/bin/env bash

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/check-pipefail-race.sh"

assert_pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_fail() {
  echo "FAIL: $1 — $2"
  FAIL=$((FAIL + 1))
}

# Creates a temp git repo holding one scripts/<name> file with the given body.
make_repo() {
  local name="$1" body="$2"
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  mkdir -p "$dir/scripts"
  printf '%s\n' "$body" > "$dir/scripts/$name"
  echo "$dir"
}

# Test 1: a pipefail script whose pipeline drains its input — exits 0
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -euo pipefail
git log | wc -l')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "pipefail piping into a draining consumer: exits 0"
else
  assert_fail "pipefail piping into a draining consumer: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 2: pipefail + `| grep -q` — exits non-zero, names the file and line
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -euo pipefail
git log | grep -q needle')"
err_output="$(cd "$REPO" && bash "$SCRIPT" 2>&1)" && script_exit=0 || script_exit=$?
if [ "$script_exit" -ne 0 ] && printf '%s' "$err_output" | grep -q "scripts/victim.sh:3"; then
  assert_pass "pipefail + grep -q: exits non-zero, names file and line"
else
  assert_fail "pipefail + grep -q: exits non-zero, names file and line" "exit=$script_exit output=$err_output"
fi
rm -rf "$REPO"

# Test 3: pipefail + `| head` — the same race, different consumer
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -euo pipefail
git log | head -1')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_fail "pipefail + head: exits non-zero" "script exited 0 (expected non-zero)"
else
  assert_pass "pipefail + head: exits non-zero"
fi
rm -rf "$REPO"

# Test 4: the same pipeline without pipefail — the race needs pipefail to bite, so it passes
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -eu
git log | grep -q needle')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "no pipefail + grep -q: exits 0"
else
  assert_fail "no pipefail + grep -q: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Test 5: an annotated line is the documented escape hatch — exits 0
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -euo pipefail
git log | grep -q needle # pipefail-safe: polarity argument goes here')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "annotated with pipefail-safe: exits 0"
else
  assert_fail "annotated with pipefail-safe: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

# Tests 6-10: the flag cluster doesn't have to *end* in q/m — these are the spellings the
# consumers are actually written as, `grep -m1` being this repo's own house style.
for variant in 'grep -qi needle' 'grep -qE needle' 'grep --quiet needle' 'grep -m1 needle' 'grep -m 1 needle'; do
  REPO="$(make_repo victim.sh "#!/usr/bin/env bash
set -euo pipefail
git log | $variant")"
  if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
    assert_fail "pipefail + $variant: exits non-zero" "script exited 0 (expected non-zero)"
  else
    assert_pass "pipefail + $variant: exits non-zero"
  fi
  rm -rf "$REPO"
done

# Tests 11-12: `||` is not a pipe — neither has a producer to take SIGPIPE
for fallback in '[ -f f ] || grep -q needle f' 'git log || head -1'; do
  REPO="$(make_repo victim.sh "#!/usr/bin/env bash
set -euo pipefail
$fallback")"
  if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
    assert_pass "|| fallback ($fallback): exits 0"
  else
    assert_fail "|| fallback ($fallback): exits 0" "script exited non-zero"
  fi
  rm -rf "$REPO"
done

# Test 13: a draining grep is still not a hazard — guards against over-broadening the flag match
REPO="$(make_repo victim.sh '#!/usr/bin/env bash
set -euo pipefail
git log | grep -c needle')"
if (cd "$REPO" && bash "$SCRIPT" >/dev/null 2>&1); then
  assert_pass "pipefail + grep -c: exits 0"
else
  assert_fail "pipefail + grep -c: exits 0" "script exited non-zero"
fi
rm -rf "$REPO"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
