#!/usr/bin/env bash
# Before planning: with require-up-to-date, a branch behind its base cannot be planned.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

if [ "$REQUIRE_UP_TO_DATE" != true ]; then
  echo "A branch behind its base may be planned. The apply compares a fresh plan with the approved one."
  exit 0
fi
if [ "$ON_PR" != true ]; then
  echo "Not a pull request, so there is no base to compare with."
  exit 0
fi
pr=$(gh api -H "X-GitHub-Api-Version: $STACK_API" "repos/$REPO/pulls/$PR")
base=$(echo "$pr" | jq -r '.stack.base.ref // .base.ref')
head=$(echo "$pr" | jq -r .head.sha)
require_current "$base" "$head" "plan again"
echo "Up to date with $base."
