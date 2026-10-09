#!/usr/bin/env bash
# Before planning or applying: key the provider cache on the workspace's lock
# file, read from the API since the checkout comes later, so the apply reuses
# what the plan downloaded.
# shellcheck source=scripts/common.sh
source "$(dirname "$0")/common.sh"

# dflook's container runs with HOME=/github/home, mounted from here, and keeps
# its plugin cache under it
echo "path=$RUNNER_TEMP/_github_home/.terraform.d/plugin-cache" >> "$GITHUB_OUTPUT"

if [ -z "${TF_PROVIDER_DOWNLOAD_RETRY:-}" ]; then
  echo "TF_PROVIDER_DOWNLOAD_RETRY=5" >> "$GITHUB_ENV"
fi

if [ -z "$WORKSPACE" ]; then
  echo "No workspace, so no provider cache."
  exit 0
fi
lock=$(realpath -m --relative-to=/ "/$WORKSPACE/.terraform.lock.hcl")
if ! hash=$(gh api -H "Accept: application/vnd.github.raw" "repos/$REPO/contents/$lock?ref=$GITHUB_SHA" | sha256sum); then
  echo "No $lock at $GITHUB_SHA, so no provider cache."
  exit 0
fi
echo "key=terraform-github-tacos-providers-$RUNNER_OS-$RUNNER_ARCH-${hash%% *}" >> "$GITHUB_OUTPUT"
