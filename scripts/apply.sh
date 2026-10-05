#!/usr/bin/env bash
# Before applying. Approval can come long after the plan, so check again what
# the plan step checked, and record who approved. An auto-apply workspace has
# no approval, and the person who started the run stands in.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

if [ "$EVENT" = pull_request ] && [ "$APPLY_BEFORE_MERGE" != true ]; then
  echo "::error::#$PR is applied after it merges, by the run for the push to $DEFAULT_BRANCH. Run the apply job on push rather than pull_request, or set apply-before-merge to \"true\" on the pending, apply and merge steps to apply before the merge."
  exit 1
fi

approved=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID/approvals" \
  --jq '[.[] | select(.state == "approved") | .user.login] | last // empty' || true)
approver=${approved:-$GITHUB_ACTOR}
echo "approver=$approver" >> "$GITHUB_OUTPUT"

subject=$GITHUB_REF_NAME
if [ "$EVENT" = pull_request ]; then
  subject="#$PR"
  pr=$(gh api -H "X-GitHub-Api-Version: $STACK_API" "repos/$REPO/pulls/$PR")
  if [ "$(echo "$pr" | jq .merged)" = true ]; then
    echo "::error::#$PR has merged, so there is no pull request left to apply. Apply $DEFAULT_BRANCH with workflow_dispatch instead."
    exit 1
  fi
  head=$(echo "$pr" | jq -r .head.sha)
  if [ "$head" != "$PLANNED" ]; then
    echo "::error::#$PR is at $head now, not $PLANNED, which this run planned. Approve the run for $head instead."
    exit 1
  fi
  # A native stack merges into its base all at once, and pending has checked
  # that applying from this pull request is safe
  base=$(echo "$pr" | jq -r '.stack.base.ref // .base.ref')
  if [ "$base" != "$DEFAULT_BRANCH" ]; then
    echo "::error::#$PR targets $base rather than $DEFAULT_BRANCH, outside a native stack. An apply runs before the merge, so a plan from a stacked branch carries whatever is below it. Merge the branch underneath first, retarget this one at $DEFAULT_BRANCH, then plan again."
    exit 1
  fi
  if [ "$REQUIRE_UP_TO_DATE" = true ]; then
    require_current "$base" "$head" "approve the new run"
    echo "Still $PLANNED, up to date with $base."
  else
    echo "Still $PLANNED."
  fi
elif [ "$EVENT" = push ]; then
  # Only the newest commit applies, since its plan carries every older one's
  # changes; pending cancels the older runs that wait
  head=$(gh api "repos/$REPO/commits/$GITHUB_REF_NAME" --jq .sha)
  if [ "$head" != "$GITHUB_SHA" ]; then
    echo "::error::$GITHUB_REF_NAME is at $head now, not $GITHUB_SHA, which this run planned. Approve the run for $head instead."
    exit 1
  fi
  echo "Still the head of $GITHUB_REF_NAME, $GITHUB_SHA."
fi

if [ -n "$approved" ]; then
  line="Approved by @$approver"
else
  line="Applied without an approval, in a run @$approver started,"
fi
summary "### ${WORKSPACE:-Apply} approval" "" \
  "$line for $subject at \`${PLANNED:-$GITHUB_SHA}\`."
