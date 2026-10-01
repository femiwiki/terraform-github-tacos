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
  # "Re-run failed jobs" copies the other jobs into the new attempt without
  # their annotations, so read them from the attempt that ran each job. A copy
  # keeps the name and start time of the job it came from.
  started=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID/attempts/$GITHUB_RUN_ATTEMPT" --jq .run_started_at)
  workspaces=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID/jobs?filter=all" --paginate \
    --jq '.jobs[] | {id, name, attempt: .run_attempt, started_at}' \
    | jq -rs --argjson attempt "$GITHUB_RUN_ATTEMPT" --arg started "$started" '
      group_by([.name, .started_at])[] | select(any(.attempt == $attempt)) | min_by(.attempt)
      | if .attempt == $attempt and .started_at != null and .started_at < $started
        then error("\(.name) was copied from an earlier attempt that is not listed, so its changes are unknown. Re-run all jobs.")
        else .id end' \
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
