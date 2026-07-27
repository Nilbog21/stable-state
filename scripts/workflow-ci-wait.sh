#!/usr/bin/env bash
# Blocking CI gate for /reviewIssue and /finishIssue (#1117). Polls internally
# and prints exactly one verdict line:
#   0  CI: pass                                (nothing else on this path)
#   1  CI: fail — {names}
#   2  CI: conflict — rebase needed
#   3  CI: timeout after {N}m — {pending names}
#   4  a gh call itself failed
set -uo pipefail

PR="${1:?usage: workflow-ci-wait.sh <pr-number> [timeout-minutes]}"
TIMEOUT_MIN="${2:-5}"
INTERVAL=15
deadline=$(( SECONDS + TIMEOUT_MIN * 60 ))

# ponytail: every check counts as required. gh 2.46 has no `gh pr checks --json`,
# and statusCheckRollup's isRequired comes back null (the GraphQL field needs a
# pullRequestNumber: argument gh doesn't pass). Stricter than required-only, and
# it keeps /reviewIssue's Vercel-failure branch reachable. If a future gh exposes
# isRequired, filtering on it is the upgrade path.
while :; do
  pr_json=$(gh pr view "$PR" --json mergeable,headRefOid,statusCheckRollup) || exit 4

  if [ "$(jq -r .mergeable <<<"$pr_json")" = "CONFLICTING" ]; then
    echo "CI: conflict — rebase needed"
    exit 2
  fi

  # Cross-check the rollup against the real workflow runs for this exact SHA on
  # every poll, not once — the rollup lags for a minute or two after a push and
  # can briefly show only an unrelated passing check.
  sha=$(jq -r .headRefOid <<<"$pr_json")
  runs_json=$(gh api "repos/{owner}/{repo}/actions/runs?head_sha=$sha") || exit 4

  status=$(jq -rn --argjson pr "$pr_json" --argjson runs "$runs_json" '
    def verdict($n; $s; $c):
      if $s != "COMPLETED" or $c == "PENDING" then "PENDING\t\($n)"
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
