#!/usr/bin/env bash
# Before planning: a branch behind its base cannot be planned.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

if [ "$EVENT" != pull_request ]; then
  echo "Not a pull request, so there is no base to compare with."
  exit 0
fi
base=$(jq -r .pull_request.base.ref "$GITHUB_EVENT_PATH")
head=$(gh api "repos/$REPO/pulls/$PR" --jq .head.sha)
require_current "$base" "$head" "plan again"
echo "Up to date with $base."
