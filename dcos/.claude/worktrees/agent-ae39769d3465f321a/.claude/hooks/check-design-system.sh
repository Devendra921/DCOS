#!/usr/bin/env bash
# PostToolUse hook (Write|Edit) — warns Claude when a written/edited HTML/JSX/TSX
# file looks like it violates COMPONENTS.md's Forbidden list. Warn-only: never
# blocks (always exits 0). Tune the patterns in design-system-rules.sh — that
# file is the single source of truth for the actual checks, shared with the CI
# check in .github/scripts/ci-design-check.sh, so the two callers can't drift.
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../design-system/.claude/hooks/design-system-rules.sh
source "$script_dir/../../design-system/.claude/hooks/design-system-rules.sh"

findings=$(ds_check_file "$file_path") || true

if [ -z "$findings" ]; then
  exit 0
fi

msg=$(echo "$findings" | sed 's/^/- /')
jq -n --arg file "$file_path" --arg msg "$msg" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Design-system check flagged possible issues in \($file):\n\($msg)\nThis is a warning, not a block — cross-check against COMPONENTS.md and fix if it is a real violation, or proceed if it is a false positive.")
  }
}'
