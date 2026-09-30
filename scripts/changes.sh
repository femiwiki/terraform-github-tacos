#!/usr/bin/env bash
# After planning: whether anything is left to apply, left where pending finds it.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

: "${WORKSPACE:?the changes step needs a workspace}"
counts=$(plan_counts "$PLAN_JSON")
# A plan that only moves or imports resources can still count as having no changes
if [ "$CHANGES" = true ] || [ "$(echo "$counts" | jq '.moved + .imported')" -gt 0 ]; then
  apply=true
  # A matrix job has one set of outputs for all of its legs, so pending reads
  # this annotation from each leg's check run instead
  echo "::notice title=$MARKER::$WORKSPACE"
  echo "The plan has changes, so $WORKSPACE waits for its environment to approve them."
else
  apply=false
  echo "The plan is empty."
fi
echo "apply=$apply" >> "$GITHUB_OUTPUT"

summary "### $WORKSPACE plan" "" \
  "$(counts_table "$counts")" ""
plan_text "$PLAN_TEXT"
if [ "$apply" = true ]; then
  summary "Waiting for the \`$WORKSPACE\` environment to approve the apply."
else
  summary "Nothing to apply."
fi
