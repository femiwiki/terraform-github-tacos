#!/usr/bin/env bash
# Before applying. Approval can come long after the plan, so check again what
# the plan step checked, and record who approved.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

approver=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID/approvals" \
  --jq '[.[] | select(.state == "approved") | .user.login] | last // empty' || true)
approver=${approver:-$GITHUB_ACTOR}
echo "approver=$approver" >> "$GITHUB_OUTPUT"

subject=$GITHUB_REF_NAME
if [ "$EVENT" = pull_request ]; then
  subject="#$PR"
  pr=$(gh api "repos/$REPO/pulls/$PR")
  if [ "$(echo "$pr" | jq .merged)" = true ]; then
    echo "::error::#$PR has merged, so there is no pull request left to apply. Apply $DEFAULT_BRANCH with workflow_dispatch instead."
    exit 1
  fi
  head=$(echo "$pr" | jq -r .head.sha)
  if [ "$head" != "$PLANNED" ]; then
    echo "::error::#$PR is at $head now, not $PLANNED, which this run planned. Approve the run for $head instead."
    exit 1
  fi
  base=$(echo "$pr" | jq -r .base.ref)
  if [ "$base" != "$DEFAULT_BRANCH" ]; then
    echo "::error::#$PR targets $base rather than $DEFAULT_BRANCH. An apply runs before the merge, so a plan from a stacked branch carries whatever is below it. Merge the branch underneath first, retarget this one at $DEFAULT_BRANCH, then plan again."
    exit 1
  fi
  require_current "$base" "$head" "approve the new run"
  echo "Still $PLANNED, up to date with $base."
fi

summary "### ${WORKSPACE:-Apply}" "" \
  "Approved by @$approver for $subject at \`${PLANNED:-$GITHUB_SHA}\`."
