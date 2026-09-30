# shellcheck shell=bash
# Sourced by the other scripts, which use what it sets.
# shellcheck disable=SC2034
set -euo pipefail

REPO=$GITHUB_REPOSITORY
EVENT=$GITHUB_EVENT_NAME
PR=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")
PLANNED=$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")
DEFAULT_BRANCH=$(jq -r '.repository.default_branch' "$GITHUB_EVENT_PATH")

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

# Resource counts of a plan in JSON, such as `tofu show -json` writes
plan_counts() {
  if [ -z "${1:-}" ] || [ ! -f "$1" ]; then
    echo '{"create":0,"update":0,"delete":0,"moved":0,"imported":0}'
    return
  fi
  jq -c '[.resource_changes[]?] | {
    create: map(select(.change.actions | index("create"))) | length,
    update: map(select(.change.actions == ["update"])) | length,
    delete: map(select(.change.actions | index("delete"))) | length,
    moved: map(select(.previous_address)) | length,
    imported: map(select(.change.importing)) | length}' "$1"
}

# A Markdown table of plan_counts
counts_table() {
  echo "$1" | jq -r '"| Add | Change | Destroy | Move | Import |\n|---|---|---|---|---|\n| \(.create) | \(.update) | \(.delete) | \(.moved) | \(.imported) |"'
}

# The plan as text, folded, and cut short of the 1 MiB a step summary may hold
plan_text() {
  local path=${1:-} limit=900000 size
  if [ -z "$path" ] || [ ! -f "$path" ]; then
    return
  fi
  size=$(wc -c < "$path")
  summary "<details><summary>Plan</summary>" "" '```'
  head -c "$limit" "$path" | awk 1 >> "$GITHUB_STEP_SUMMARY"
  summary '```' ""
  if [ "$size" -gt "$limit" ]; then
    summary "Cut at $limit of $size bytes. The job log has the whole plan." ""
  fi
  summary "</details>" ""
}
