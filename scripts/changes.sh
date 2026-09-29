#!/usr/bin/env bash
# After planning: whether anything is left to apply, left where pending finds it.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

: "${WORKSPACE:?the changes step needs a workspace}"
counts='{"create":0,"update":0,"delete":0,"moved":0,"imported":0}'
if [ -n "$PLAN_JSON" ]; then
  counts=$(jq -c '[.resource_changes[]?] | {
    create: map(select(.change.actions | index("create"))) | length,
    update: map(select(.change.actions == ["update"])) | length,
    delete: map(select(.change.actions | index("delete"))) | length,
    moved: map(select(.previous_address)) | length,
    imported: map(select(.change.importing)) | length}' "$PLAN_JSON")
fi
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
  "$(echo "$counts" | jq -r '"| Add | Change | Destroy | Move | Import |\n|---|---|---|---|---|\n| \(.create) | \(.update) | \(.delete) | \(.moved) | \(.imported) |"')" ""
if [ "$apply" = true ]; then
  summary "Waiting for the \`$WORKSPACE\` environment to approve the apply."
else
  summary "Nothing to apply."
fi
