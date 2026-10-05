# shellcheck shell=bash
# Sourced by the other scripts, which use what it sets.
# shellcheck disable=SC2034
set -euo pipefail

REPO=$GITHUB_REPOSITORY
EVENT=$GITHUB_EVENT_NAME
PR=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")
PLANNED=$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")
DEFAULT_BRANCH=$(jq -r '.repository.default_branch' "$GITHUB_EVENT_PATH")

# The REST API version whose pull requests carry their native stack
STACK_API=2026-03-10

# The annotation the changes step leaves and the pending step looks for
MARKER="Changes to apply"

summary() {
  printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
}

# How far a head is behind its base, fails when it is
require_current() {
  local base=$1 head=$2 then=$3 behind
  behind=$(gh api "repos/$REPO/compare/$base...$head" --jq .behind_by)
  if [ "$behind" -gt 0 ]; then
    echo "::error::#$PR is $behind commits behind $base, so a plan from it describes a tree that no longer exists and applying it would undo what landed meanwhile. Update the branch, then $then."
    exit 1
  fi
}
