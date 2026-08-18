#!/usr/bin/env bash
# Blocking CI gate for /reviewIssue and /finishIssue (#1117). Polls internally
# and exits with exactly one of:
#   0  prints "CI: pass"                       (nothing else on this path)
#   1  prints "CI: fail — {names}"
#   2  prints "CI: conflict — rebase needed" (only after the conflict settles —
#      two consecutive CONFLICTING reads one poll apart; see below)
#   3  prints "CI: timeout after {N}m — {pending names}"
#   4  prints NOTHING — a gh call or the jq verdict computation failed
# Omitting <pr> also exits 1, via the ${1:?} expansion below, printing a usage
# line to stderr rather than a verdict — callers always pass one.
set -uo pipefail

PR="${1:?usage: workflow-ci-wait.sh <pr-number> [timeout-minutes]}"
TIMEOUT_MIN="${2:-5}"
INTERVAL=15
deadline=$(( SECONDS + TIMEOUT_MIN * 60 ))
conflicting_streak=0

# ponytail: every check counts as required. gh 2.46 has no `gh pr checks --json`,
# and statusCheckRollup's isRequired comes back null (the GraphQL field needs a
# pullRequestNumber: argument gh doesn't pass). Stricter than required-only, and
# it keeps /reviewIssue's Vercel-failure branch reachable. If a future gh exposes
# isRequired, filtering on it is the upgrade path.
while :; do
  pr_json=$(gh pr view "$PR" --json mergeable,headRefOid,headRefName,statusCheckRollup) || exit 4

  # -e so a null/absent field or unparseable payload exits 4 rather than
  # sailing on: an empty $sha below makes gh return the *entire* repo's run
  # history unfiltered, which would then be scored as this PR's checks.
  mergeable=$(jq -er .mergeable <<<"$pr_json") || exit 4

  # mergeable is three-valued, and only MERGEABLE is trustworthy on a single read.
  #
  # UNKNOWN means GitHub hasn't finished computing mergeability yet — it does so
  # lazily, and every push or base-branch move reopens that window. Treating it
  # as "not conflicting" lets a green rollup print "CI: pass" on a PR that is in
  # fact conflicting, which is the exact misdiagnosis this gate exists to stop.
  #
  # CONFLICTING gets the same skepticism for one poll (#1155): inside that same
  # recompute window GitHub returns CONFLICTING for a PR that is in fact
  # MERGEABLE and 0 commits behind, and exit 2 sends the caller into a costly,
  # unnecessary rebase. So it takes two consecutive CONFLICTING reads, one
  # INTERVAL apart, to exit 2; a lone one counts as pending and any other value
  # resets the streak (a CONFLICTING→MERGEABLE→CONFLICTING sequence is not two
  # consecutive reads).
  #
  # Both cases are counted as pending, so we poll until they settle (or time out
  # saying so) — including a first CONFLICTING that lands on the deadline, which
  # honestly reports exit 3 rather than a conflict this gate never confirmed.
  if [ "$mergeable" = "CONFLICTING" ]; then
    conflicting_streak=$(( conflicting_streak + 1 ))
    if [ "$conflicting_streak" -ge 2 ]; then
      echo "CI: conflict — rebase needed"
      exit 2
    fi
    unknown_mergeability="conflict reported once — re-checking"
  elif [ "$mergeable" = "MERGEABLE" ]; then
    conflicting_streak=0
    unknown_mergeability=""
  else
    conflicting_streak=0
    unknown_mergeability="mergeability not yet computed"
  fi

  # Cross-check the rollup against the real workflow runs for this exact SHA on
  # every poll it reaches, not once — the rollup lags for a minute or two after a
  # push and can briefly show only an unrelated passing check. (A poll the anchor
  # below vetoes never reaches it: there is nothing worth asking about that head.)
  sha=$(jq -er .headRefOid <<<"$pr_json") || exit 4
  head_ref=$(jq -er .headRefName <<<"$pr_json") || exit 4

  # The anchor (#1622). `headRefOid` above is a field on GitHub's PR *record*, and that record lags
  # a push by seconds — during which the rollup and the head_sha runs query below both describe the
  # previous head, agree with each other, and produce a verdict for a commit nobody asked about.
  # Observed twice on PR #1615: an inherited `CI: fail` for a head that passed, and an inherited
  # `CI: pass` for a head that in fact failed, which /finishIssue would have merged on.
  #
  # So the verdict is anchored to a SHA that cannot itself be stale: the remote-tracking ref, which
  # `git push` updates as part of the very push that opens the window. Not HEAD — that includes
  # commits never pushed, which CI was never asked to evaluate and which would pend to the deadline.
  #
  # Read per poll, and *after* the PR record rather than before it. Once before the loop was the
  # first cut, and it turned a second push landing mid-wait into a permanent mismatch: the cached
  # anchor could never equal the head GitHub eventually caught up to, so a real verdict — including
  # a real failure — degraded into a timeout. Reading after the PR payload also means a push landing
  # during that very API call reads as a mismatch rather than being missed.
  #
  # The branch is matched through `branch.<local>.merge` rather than by assuming the remote is
  # called `origin`: a fork remote under any other name would otherwise silently disable the anchor,
  # which is the one failure this must not have. Where the anchor genuinely can't be resolved — a
  # worktree not on the PR's branch at all — the gate behaves as it did before, a documented
  # limitation rather than silent coverage. See docs/scripts.md.
  anchor_sha=$(git rev-parse '@{u}' 2>/dev/null) || anchor_sha=""
  anchor_branch=$(git config "branch.$(git symbolic-ref --short HEAD 2>/dev/null).merge" 2>/dev/null) || anchor_branch=""

  # Both sources below — the rollup already read, and the runs query keyed on the same SHA — speak
  # for whatever head the PR record currently names. When that isn't the head we pushed, neither is
  # evidence about anything, so the veto skips the entire verdict block rather than adding a pending
  # marker to it: the fail branch exits *before* pending is assembled, and would fire regardless.
  # A head newer than ours is vetoed too — someone else pushed, and those runs score a commit this
  # worktree has never seen.
  if [ -n "$anchor_sha" ] && [ "$anchor_branch" = "refs/heads/$head_ref" ] && [ "$anchor_sha" != "$sha" ]; then
    status=$(printf 'PENDING\thead %s not yet reported by GitHub (PR head %s)' \
      "${anchor_sha:0:8}" "${sha:0:8}")
  else
    runs_json=$(gh api "repos/{owner}/{repo}/actions/runs?head_sha=$sha") || exit 4

    status=$(jq -rn --argjson pr "$pr_json" --argjson runs "$runs_json" '
      # EXPECTED means "not reported yet" on the legacy commit-status API —
      # unreachable while every check is CheckRun-typed, but pending, not failed.
      def verdict($n; $s; $c):
        if $s != "COMPLETED" or (["PENDING","EXPECTED"] | index($c)) then "PENDING\t\($n)"
        elif ["SUCCESS","SKIPPED","NEUTRAL"] | index($c) then empty
        else "FAIL\t\($n)" end;
      ( $pr.statusCheckRollup[]?
        | verdict(.name // .context;
                  (.status // "COMPLETED") | ascii_upcase;
                  ((.conclusion // .state) // "PENDING") | ascii_upcase) ),
      ( if ($runs.workflow_runs | length) == 0 then "PENDING\tworkflow run not started"
        else $runs.workflow_runs[]
          | verdict(.name; .status | ascii_upcase; (.conclusion // "PENDING") | ascii_upcase)
        end )
    ') || exit 4

    fails=$(awk -F'\t' '$1=="FAIL"{print $2}' <<<"$status" | sort -u | paste -sd, -)
    if [ -n "$fails" ]; then
      echo "CI: fail — ${fails//,/, }"
      exit 1
    fi
  fi

  [ -n "$unknown_mergeability" ] && status=$(printf '%s\nPENDING\t%s' "$status" "$unknown_mergeability")

  pending=$(awk -F'\t' '$1=="PENDING"{print $2}' <<<"$status" | sort -u | paste -sd, -)
  if [ -z "$pending" ]; then
    echo "CI: pass"
    exit 0
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "CI: timeout after ${TIMEOUT_MIN}m — ${pending//,/, }"
    exit 3
  fi
  sleep "$INTERVAL"
done
