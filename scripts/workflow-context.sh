#!/usr/bin/env bash
# Emits the Step 0 context the workflow skills (/beginIssue, /reviewIssue, /testIssue,
# /finishIssue, /continueIssue) all need, as key=value lines. Single source of truth for
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

port_for() {
  local entry
  for entry in "${WORKTREES[@]}"; do
    [[ ${entry%%:*} == "$1" ]] && { echo "${entry##*:}"; return; }
  done
}

# The one definition of the label -> base branch rule.
# process-for-release is checked first: those are release close-out steps that land on
# main even when the issue also carries a release-N label.
base_for_labels() {
  local labels=" $1 "
  if [[ $labels == *" process-for-release "* ]]; then echo "main"; return; fi
  if [[ $labels =~ [[:space:]]patch-[0-9]+[[:space:]] ]]; then echo "main"; return; fi
  if [[ $labels =~ [[:space:]]release-([0-9]+)[[:space:]] ]]; then
    echo "release/release-${BASH_REMATCH[1]}"; return
  fi
  echo "main"
}

worktree=""
worktree_path=""
port=""
root=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
if [[ $root =~ stable-state-worktrees/([a-z]+)$ ]]; then
  port=$(port_for "${BASH_REMATCH[1]}")
  if [[ -n $port ]]; then
    worktree="${BASH_REMATCH[1]}"
    worktree_path="$root"
  fi
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

issue="${1:-}"
if [[ -z $issue && $branch =~ ^([0-9]+)- ]]; then
  issue="${BASH_REMATCH[1]}"
fi

base=""
if [[ -n $issue ]]; then
  if labels=$(gh issue view "$issue" --json labels -q '[.labels[].name] | join(" ")' 2>/dev/null); then
    base=$(base_for_labels "$labels")
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

echo "worktrees=${WORKTREES[*]%%:*}"
echo "worktree=$worktree"
echo "worktree_path=$worktree_path"
echo "port=$port"
echo "branch=$branch"
echo "issue=$issue"
echo "base=$base"
echo "pr=$pr"
echo "pr_state=$pr_state"

exit 0
