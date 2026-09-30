#!/usr/bin/env bash
# After applying, whether or not it succeeded: what the apply did.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

: "${WORKSPACE:?the result step needs a workspace}"
counts=$(plan_counts "$PLAN_JSON")
changed=$(echo "$counts" | jq '.create + .update + .delete + .moved + .imported')
case "$OUTCOME" in
  success)
    if [ "$changed" -gt 0 ]; then result=applied; line="Applied."; else result=no-changes; line="Nothing to apply."; fi ;;
  cancelled) result=cancelled; line="**Cancelled.**" ;;
  skipped) result=skipped; line="Did not run, because an earlier step failed." ;;
  *) result=failed; line="**Failed.** Part of this plan may have been applied, and the job log says which." ;;
esac
echo "result=$result" >> "$GITHUB_OUTPUT"
echo "$WORKSPACE: $result"

summary "### $WORKSPACE apply" "" "$line" ""
if [ -n "$PLAN_JSON" ] && [ -f "$PLAN_JSON" ]; then
  summary "$(counts_table "$counts")" ""
fi
plan_text "$PLAN_TEXT"
if [ -n "$APPROVER" ]; then
  summary "Approved by @$APPROVER."
fi
