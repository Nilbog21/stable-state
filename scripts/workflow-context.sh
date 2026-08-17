#!/usr/bin/env bash
# Emits the Step 0 context the workflow skills (/beginIssue, /reviewIssue, /testIssue,
# /finishIssue, /continueIssue, and /runChecklist for release_base alone — #1560) all
# need, as key=value lines. Single source of truth for
# the worktree->port map and the label->base-branch rule (#1118 — that rule had three
# divergent copies, and process-for-release existed in only one of them).
#
#   bash scripts/workflow-context.sh [issue-number]
#
# The optional issue number wins over the one parsed from the branch — /beginIssue needs
# a base branch for an issue whose branch doesn't exist yet.
#
# Never fails: unknown fields come back empty and the exit status is always 0, so the
# calling skill knows to ask. A script can't prompt.
set -uo pipefail

# The one worktree->port map. Ordered, so `worktrees=` reads the way a prompt should.
WORKTREES=(alpha:3001 beta:3002 gamma:3003 delta:3004 epsilon:3005)

# `fable-N` — the /fableFleet headless fleet — is a rule rather than table rows: port
# 3100+N, for any N. Unbounded because the fleet sizes itself to a batch's concurrency
# cap, and deliberately absent from `worktrees=` because that list is the prompt the
# skills offer a *human*, and a fable worktree is never chosen interactively. Detection
# still has to resolve one, though: a worker runs the same five skills from inside it,
# and an unresolved worktree makes them stop and ask a user who isn't there.
port_for() {
  local entry
  for entry in "${WORKTREES[@]}"; do
    [[ ${entry%%:*} == "$1" ]] && { echo "${entry##*:}"; return; }
  done
  # 10# so a zero-padded name (fable-08) isn't read as octal.
  [[ $1 =~ ^fable-([0-9]+)$ ]] && echo "$((3100 + 10#${BASH_REMATCH[1]}))"
}

# The one definition of the label -> base branch rule. Sets `base`, and `base_from_label`
# to yes/no — /finishIssue needs to know whether a label actually decided this or whether
# it's just the fallback, because it asks for confirmation before merging an untriaged
# issue rather than trusting the default. Sets rather than echoes so both survive: a
# `$(...)` call would run this in a subshell and drop `base_from_label`.
#
# Order matters, and `release-N` beats `process-for-release` (#1542). That is a reversal:
# the rule used to check process-for-release first, on the claim that "those are release
# close-out steps that land on main even when the issue also carries a release-N label".
# The claim was false when it was written. Of release-3's ceremony issues, #978 (PR #982)
# and #979 (PR #983) both landed on `release/release-3`, and RELEASE_CEREMONY.md steps 5
# and 6 *prescribe* that base, citing those two PRs by number as the precedent. Only #977
# — the release merge itself — went to main, and #1542 restructured that step out of issue
# shape entirely: the four issues the ceremony now files (Wrapup 1, 4, 5, 6) all ride into
# main on the release's merge commit, so all four want the release branch.
#
# The label is kept as a *fallback* rather than deleted, so a process-for-release issue
# carrying no release-N still resolves to main with base_from_label=yes — /finishIssue
# reads that flag to decide whether to confirm before merging, and demoting the label to
# the untriaged default would make it prompt on a triaged issue.
#
# This mis-routed silently for a release. The cost is worst headless: /fableFleet does
# `git worktree add --detach origin/{base}` straight off this answer, so a mis-routed
# ceremony issue gets a worktree where the files it edits don't exist, and nobody is
# watching. Hence scripts/workflow-context.test.sh, wired into ci.sh.
base_for_labels() {
  local labels=" $1 "
  base_from_label=yes
  if [[ $labels =~ [[:space:]]patch-[0-9]+[[:space:]] ]]; then base="main"; return; fi
  if [[ $labels =~ [[:space:]]release-([0-9]+)[[:space:]] ]]; then
    base="release/release-${BASH_REMATCH[1]}"; return
  fi
  if [[ $labels == *" process-for-release "* ]]; then base="main"; return; fi
  base="main"
  base_from_label=no
}

# Sourced with WORKFLOW_CONTEXT_LIB set, the file defines its functions and stops, so the
# test can exercise base_for_labels without the `gh`/`git` round trips below.
[[ -n ${WORKFLOW_CONTEXT_LIB:-} ]] && return 0

worktree=""
worktree_path=""
port=""
root=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
if [[ $root =~ stable-state-worktrees/([a-z]+(-[0-9]+)?)$ ]]; then
  name="${BASH_REMATCH[1]}"
  port=$(port_for "$name")
  if [[ -n $port ]]; then
    worktree="$name"
    worktree_path="$root"
  fi
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

issue="${1:-}"
if [[ -z $issue && $branch =~ ^([0-9]+)- ]]; then
  issue="${BASH_REMATCH[1]}"
fi

base=""
base_from_label=""
if [[ -n $issue ]]; then
  if labels=$(gh issue view "$issue" --json labels -q '[.labels[].name] | join(" ")' 2>/dev/null); then
    base_for_labels "$labels"
  else
    issue=""  # no such issue — don't report one we couldn't confirm
  fi
fi

pr=""
pr_state=""
if pr_line=$(gh pr view --json number,state -q '"\(.number) \(.state)"' 2>/dev/null); then
  pr="${pr_line%% *}"
  pr_state="${pr_line##* }"
fi

# Which sibling worktrees are free to take new work. `/issueBatch pick` fills every free
# one, so it needs the count; the map lives here rather than in the skill for the same
# reason the port map does (#1118).
#
# Derived from local git alone — no `gh` calls. The other six skills read none of this
# and all call the script at Step 0, so a per-worktree network round trip would tax every
# one of them for a field only `pick` wants.
#
# Busy = a dirty tree, or a HEAD carrying commits the release branch doesn't have yet.
# The corollary is what makes it useful: a merged issue branch left checked out — the
# normal state after `/finishIssue` — is an ancestor of the release branch and reads free,
# with no need to ask GitHub whether its issue closed.
#
# `fable-N` worktrees are excluded on purpose, same rationale as `worktrees=` above: this
# answers "where can a human start something", and the fleet is never chosen that way.
release_ref=$(git branch -r --list 'origin/release/release-*' | sed 's|.*origin/release/||' | sort -t- -k2 -n | tail -1)
if [[ -n $release_ref ]]; then release_ref="origin/release/$release_ref"; else release_ref="origin/main"; fi

declare -A WT_PATHS=()
while read -r wt_path; do
  [[ $wt_path =~ stable-state-worktrees/([a-z]+(-[0-9]+)?)$ ]] && WT_PATHS[${BASH_REMATCH[1]}]="$wt_path"
done < <(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')

worktree_state=""
for entry in "${WORKTREES[@]}"; do
  name="${entry%%:*}"
  wt_path="${WT_PATHS[$name]:-}"
  [[ -z $wt_path ]] && continue
  if [[ -n $(git -C "$wt_path" status --porcelain 2>/dev/null) ]] ||
     ! git -C "$wt_path" merge-base --is-ancestor HEAD "$release_ref" 2>/dev/null; then
    worktree_state+=" $name:busy"
  else
    worktree_state+=" $name:free"
  fi
done

echo "worktrees=${WORKTREES[*]%%:*}"
echo "worktree_state=${worktree_state# }"
echo "worktree=$worktree"
echo "worktree_path=$worktree_path"
echo "port=$port"
echo "branch=$branch"
echo "issue=$issue"
echo "base=$base"
echo "base_from_label=$base_from_label"
# The current release branch, for /runChecklist (#1560), which verifies which branch it is
# about to test a whole release against. `base` can't answer that: it derives from the
# issue number in the branch name, so on `release/release-N` itself — the state the run
# *wants* — there is no issue and `base` is empty, and on a leftover `patch-N` branch it
# resolves to `main`. `release_ref` above is already the right value and is always set, so
# this is a second name for it rather than a second derivation (#1118's rule).
#
# It is only as fresh as the caller's remote-tracking refs — nothing here fetches, on
# purpose (#1231). A caller that gates on it fetches first; see `docs/scripts.md`.
echo "release_base=${release_ref#origin/}"
echo "pr=$pr"
echo "pr_state=$pr_state"

exit 0
