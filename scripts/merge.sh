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
branch=$(jq -r .pull_request.head.ref "$GITHUB_EVENT_PATH")
shas=$(gh api "repos/$REPO/pulls/$PR/commits" --paginate --jq '.[].sha' | jq -Rsc 'split("\n")')
approved=false
for run in $(gh api "repos/$REPO/actions/workflows/$workflow/runs?event=pull_request&branch=$branch" --paginate \
  --jq ".workflow_runs[] | select(.head_sha | IN(${shas}[])) | .id"); do
  if [ "$(gh api "repos/$REPO/actions/runs/$run/approvals" --jq 'map(select(.state == "approved")) | length')" -gt 0 ]; then
    approved=true
    break
  fi
done
if [ "$approved" = false ]; then
  echo "::notice::#$PR was never applied, so it is left for a person to merge"
  summary "### Merge" "" "#$PR was never applied, so it is left for a person to merge."
  exit 0
fi
# A draft cannot be merged at all
if [ "$(gh pr view "$PR" --repo "$REPO" --json isDraft --jq .isDraft)" = true ]; then
  gh pr ready "$PR" --repo "$REPO"
fi
# The gate has just reported, and branch protection can take a moment to see
# it, so auto-merge waits out that moment
if gh pr merge "$PR" --repo "$REPO" "--$METHOD"; then
  summary "### Merge" "" "Merged #$PR."
elif gh pr merge "$PR" --repo "$REPO" "--$METHOD" --auto; then
  summary "### Merge" "" "Turned on auto-merge for #$PR."
else
  echo "::warning::could not merge #$PR; merge it by hand so $DEFAULT_BRANCH matches what is deployed"
  summary "### Merge" "" "**Could not merge #$PR.** Merge it by hand so \`$DEFAULT_BRANCH\` matches what is deployed."
fi
