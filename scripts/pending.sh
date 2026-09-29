#!/usr/bin/env bash
# Which workspaces to apply, each behind an environment that asks first.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

# Each push leaves a run behind, and one still waiting for approval would apply
# a plan of a commit the pull request no longer has. The apply step refuses that
# too; this keeps it from being offered at all.
if [ "$EVENT" = pull_request ]; then
  workflow=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID" --jq .workflow_id)
  branch=$(jq -r .pull_request.head.ref "$GITHUB_EVENT_PATH")
  gh api "repos/$REPO/actions/workflows/$workflow/runs?event=pull_request&status=waiting&branch=$branch" --paginate \
    --jq ".workflow_runs[] | select(.id < $GITHUB_RUN_ID) | .id" | while read -r run; do
    gh api --method POST "repos/$REPO/actions/runs/$run/cancel" > /dev/null \
      && echo "Cancelled run $run, which waited on an older commit" \
      || echo "::warning::could not cancel run $run"
  done
fi

if [ -n "$WORKSPACES" ]; then
  workspaces=$(echo "$WORKSPACES" | jq -c .)
else
  workspaces=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID/jobs?filter=latest" --paginate --jq '.jobs[].id' \
    | while read -r job; do
        gh api "repos/$REPO/check-runs/$job/annotations" --paginate \
          --jq ".[] | select(.annotation_level == \"notice\" and .title == \"$MARKER\") | .message"
      done | sort -u | jq -Rnc '[inputs | select(length > 0)]')
fi

summary "### Waiting for approval" ""
if [ "$workspaces" = '[]' ]; then
  summary "Nothing to apply."
else
  summary "| Environment | Who can approve |" "|---|---|"
fi
# A job naming an environment that does not exist creates it without any
# protection, and the apply would then run without asking anyone
for w in $(echo "$workspaces" | jq -r '.[]'); do
  reviewers=$(gh api "repos/$REPO/environments/$w" \
    --jq '[.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[] | .reviewer.slug // .reviewer.login] | join(", ")' 2>/dev/null || true)
  if [ -z "$reviewers" ]; then
    echo "::error::the $w environment has no required reviewers, so nothing would stop its apply."
    summary "| \`$w\` | **nobody, so this run stops here** |"
    exit 1
  fi
  summary "| \`$w\` | $reviewers |"
done
echo "workspaces=$workspaces" >> "$GITHUB_OUTPUT"
echo "Applying $workspaces"
