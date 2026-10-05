#!/usr/bin/env bash
# An apply runs before the merge, so until the pull request lands the default
# branch describes less than what is deployed, and the next apply from any
# other branch takes production back to it.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

if [ -z "$PR" ]; then
  echo "Not a pull request, so there is nothing to merge."
  exit 0
fi
if [ "$(gh pr view "$PR" --repo "$REPO" --json state --jq .state)" = MERGED ]; then
  echo "#$PR is already merged"
  summary "### Merge" "" "#$PR was already merged."
  exit 0
fi
# A run with nothing to apply merges only what a person approved applying
# before, in an earlier run of this pull request
workflow=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID" --jq .workflow_id)
# This run first, since a runs listing missed it once (infra#1039); then by
# commit, as a branch name can be reused by a later pull request
runs="$GITHUB_RUN_ID $(gh api "repos/$REPO/pulls/$PR/commits" --paginate --jq '.[].sha' | while read -r sha; do
  gh api "repos/$REPO/actions/workflows/$workflow/runs?event=pull_request&head_sha=$sha" --paginate --jq '.workflow_runs[].id'
done)"
approved=false
for run in $runs; do
  if [ "$(gh api "repos/$REPO/actions/runs/$run/approvals" --jq 'map(select(.state == "approved")) | length')" -gt 0 ]; then
    approved=true
    break
  fi
done
if [ "$approved" = false ]; then
  echo "::notice::#$PR was never applied, so it is left for a person to merge. Runs checked: $runs"
  summary "### Merge" "" "#$PR was never applied, so it is left for a person to merge."
  exit 0
fi
# A draft cannot be merged at all
if [ "$(gh pr view "$PR" --repo "$REPO" --json isDraft --jq .isDraft)" = true ]; then
  gh pr ready "$PR" --repo "$REPO"
fi
unmerged() {
  echo "::error::#$PR was applied but $1, so production is ahead of $DEFAULT_BRANCH. Merge it by hand."
  summary "### Merge" "" "**#$PR was applied but $1.** Merge it by hand so \`$DEFAULT_BRANCH\` matches what is deployed."
  exit 1
}
if gh pr merge "$PR" --repo "$REPO" "--$METHOD"; then
  summary "### Merge" "" "Merged #$PR."
  exit 0
fi
# The gate has just reported, and branch protection can take a moment to see
# it, so auto-merge waits out that moment. A required check that failed keeps
# auto-merge waiting for good, as on femiwiki/infra#1144, so it gets 2 minutes.
gh pr merge "$PR" --repo "$REPO" "--$METHOD" --auto || unmerged "could not be merged"
for _ in $(seq 12); do
  sleep 10
  if [ "$(gh pr view "$PR" --repo "$REPO" --json state --jq .state)" = MERGED ]; then
    summary "### Merge" "" "Merged #$PR by auto-merge."
    exit 0
  fi
done
unmerged "has not merged 2 minutes after auto-merge was turned on"
