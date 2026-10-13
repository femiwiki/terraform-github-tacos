# shellcheck shell=bash
# Sourced by the other scripts, which use what it sets.
# shellcheck disable=SC2034
set -euo pipefail

REPO=$GITHUB_REPOSITORY
EVENT=$GITHUB_EVENT_NAME
# A review runs for its pull request, which plans Dependabot's without its secrets
case "$EVENT" in pull_request | pull_request_review) ON_PR=true ;; *) ON_PR=false ;; esac
DEFAULT_BRANCH=$(jq -r '.repository.default_branch' "$GITHUB_EVENT_PATH")

# The annotation the changes step leaves and the pending step looks for
MARKER="Changes to apply"

summary() {
  printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
}
