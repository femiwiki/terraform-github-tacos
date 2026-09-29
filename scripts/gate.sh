#!/usr/bin/env bash
# One required check that stands for every job before it.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

: "${NEEDS:?the gate step needs toJSON(needs)}"
summary "### Gate" "" "| Job | Result |" "|---|---|"
echo "$NEEDS" | jq -r 'to_entries[] | "| \(.key) | \(.value.result) |"' >> "$GITHUB_STEP_SUMMARY"

failed=$(echo "$NEEDS" | jq -r --arg skip "$MAY_SKIP" '($skip | split(" ")) as $may
  | to_entries[]
  | select(.value.result != "success" and (.value.result != "skipped" or (.key | IN($may[]) | not)))
  | "\(.key)=\(.value.result)"')
if [ -n "$failed" ]; then
  echo "::error::$(echo "$failed" | paste -sd' ')"
  exit 1
fi
echo "All green."
