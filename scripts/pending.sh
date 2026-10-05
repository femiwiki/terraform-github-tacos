#!/usr/bin/env bash
# Which workspaces to apply, each behind an environment that asks first.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

if [ "$ON_PR" = true ] && [ "$APPLY_BEFORE_MERGE" != true ]; then
  echo "A pull request is applied after it merges, by the run for the push to $DEFAULT_BRANCH."
  echo "workspaces=[]" >> "$GITHUB_OUTPUT"
  summary "### To apply" "" "Nothing to apply until the merge. The run for the push to \`$DEFAULT_BRANCH\` applies it."
  exit 0
fi

# Each push leaves a run behind, and one still waiting for approval would apply
# a plan of a commit the branch no longer has at its head. The apply step
# refuses that too; this keeps it from being offered at all.
case "$EVENT" in
  pull_request | pull_request_review) branch=$(jq -r .pull_request.head.ref "$GITHUB_EVENT_PATH") ;;
  push) branch=$GITHUB_REF_NAME ;;
  *) branch= ;;
esac
if [ -n "$branch" ]; then
  workflow=$(gh api "repos/$REPO/actions/runs/$GITHUB_RUN_ID" --jq .workflow_id)
  gh api "repos/$REPO/actions/workflows/$workflow/runs?event=$EVENT&status=waiting&branch=$branch" --paginate \
    --jq ".workflow_runs[] | select(.id < $GITHUB_RUN_ID) | .id" | while read -r run; do
    # A run waiting on one workspace may be applying another, and cancelling
    # it would stop that apply halfway
    if [ "$(gh api "repos/$REPO/actions/runs/$run/jobs" --paginate --jq '.jobs[] | select(.status == "in_progress") | .id' | wc -l)" -gt 0 ]; then
      echo "::warning::run $run waits on an older commit but is applying, so it is left alone"
      continue
    fi
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

summary "### To apply" ""
if [ "$workspaces" = '[]' ]; then
  summary "Nothing to apply."
else
  summary "| Environment | Who can approve |" "|---|---|"
fi
# A job naming an environment that does not exist creates it without any
# protection, and the apply would then run without asking anyone. Only a
# workspace listed in auto-apply may go without required reviewers.
for w in $(echo "$workspaces" | jq -r '.[]'); do
  # A 404 still prints its body, so drop the output with the failure
  environment=$(gh api "repos/$REPO/environments/$w" 2> /dev/null) || environment=
  if [ -z "$environment" ]; then
    echo "::error::the $w environment does not exist, and the apply job would create it with nobody to approve."
    summary "| \`$w\` | **no environment, so this run stops here** |"
    exit 1
  fi
  reviewers=$(echo "$environment" \
    | jq -r '[.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[] | .reviewer.slug // .reviewer.login] | join(", ")')
  if [[ " $AUTO_APPLY " == *" $w "* ]]; then
    if [ -n "$reviewers" ]; then
      echo "::warning::$w is listed in auto-apply, but its environment has required reviewers, so it waits for them."
      summary "| \`$w\` | $reviewers |"
    else
      summary "| \`$w\` | nobody, it applies automatically |"
    fi
  elif [ -z "$reviewers" ]; then
    echo "::error::the $w environment has no required reviewers, so nothing would stop its apply. List $w in auto-apply if it should apply without an approval."
    summary "| \`$w\` | **nobody, so this run stops here** |"
    exit 1
  else
    summary "| \`$w\` | $reviewers |"
  fi
done
echo "workspaces=$workspaces" >> "$GITHUB_OUTPUT"
echo "Applying $workspaces"
