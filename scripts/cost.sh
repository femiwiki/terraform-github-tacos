#!/usr/bin/env bash
# After planning: what the plan does to the monthly bill, by Infracost.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

: "${WORKSPACE:?the cost step needs a workspace}"
if [ -z "${INFRACOST_API_KEY:-}" ]; then
  echo "::notice::No infracost-api-key, so $WORKSPACE has no cost estimate."
  exit 0
fi
if [ -z "${PLAN_JSON:-}" ] || [ ! -f "$PLAN_JSON" ]; then
  echo "::notice::No plan JSON, so $WORKSPACE has no cost estimate."
  exit 0
fi

version=v0.10.46
sum=d0d081cd39b07b2ca5c315830bfc4bcdfb0183b04c19cb18835c154482a2c97b
dir=$(mktemp -d)
curl -sSLf -o "$dir/infracost.tar.gz" \
  "https://github.com/infracost/infracost/releases/download/$version/infracost-linux-amd64.tar.gz"
echo "$sum  $dir/infracost.tar.gz" | sha256sum -c --quiet
tar -xzf "$dir/infracost.tar.gz" -C "$dir"

# Only price lookups leave the runner: with the cloud off, the CLI skips its
# org settings and so never uploads the plan or its resources.
export INFRACOST_ENABLE_CLOUD=false INFRACOST_SKIP_UPDATE_CHECK=true
# A bill estimate is no reason to hold up a plan
if ! "$dir/infracost-linux-amd64" diff --path "$PLAN_JSON" --format json --out-file "$dir/cost.json"; then
  echo "::warning::Infracost failed, so $WORKSPACE has no cost estimate."
  exit 0
fi

summary "### $WORKSPACE cost" ""
"$dir/infracost-linux-amd64" output --path "$dir/cost.json" --format github-comment >> "$GITHUB_STEP_SUMMARY"

read -r past now diff < <(jq -r '[.pastTotalMonthlyCost, .totalMonthlyCost, .diffTotalMonthlyCost]
  | map((. // "0" | tonumber * 100 | round) / 100 | if . == 0 then 0 else . end)
  | .[2] |= (if . > 0 then "+\(.)" else tostring end) | @tsv' "$dir/cost.json")
echo "$WORKSPACE monthly cost: \$$past → \$$now ($diff)"
if [ -n "$PR" ] && [ "$diff" != 0 ]; then
  gh pr comment "$PR" --repo "$REPO" --body \
    "**$WORKSPACE monthly cost**: \$$past → \$$now ($diff), [details]($GITHUB_SERVER_URL/$REPO/actions/runs/$GITHUB_RUN_ID)"
fi
