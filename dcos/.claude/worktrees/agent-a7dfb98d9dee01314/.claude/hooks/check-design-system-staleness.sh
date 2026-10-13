#!/usr/bin/env bash
# SessionStart hook — checks whether design-system/ (a submodule of
# singularity-eco/vw-design-system) is behind origin's default branch, and if
# so, injects that into context so the agent can ask the user whether to
# update now or later. Fires once per session start/resume, NOT per prompt.
#
# Deliberately silent on any failure (no submodule, offline, slow network,
# detached/non-submodule design-system/ dir) — this must never block or
# noisily interrupt session start. `git fetch` here only updates
# refs/remotes/origin/*, it never touches the working tree, so it's safe to
# run unconditionally.
set -uo pipefail

SUBMODULE_DIR="design-system"

# A submodule's .git is a FILE (gitlink to the superproject's .git/modules/),
# not a directory — use -e, not -d, or this always misses real submodules.
[ -e "$SUBMODULE_DIR/.git" ] || exit 0

cd "$SUBMODULE_DIR" || exit 0

DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -n "$DEFAULT_BRANCH" ] || DEFAULT_BRANCH="main"

# 5s cap so a flaky/offline network can never stall session start. `timeout`
# is GNU coreutils and isn't on stock macOS (only as `gtimeout` via brew) —
# fall back to running unguarded rather than failing outright via "command
# not found", since that would silently disable the whole hook on macOS.
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout 5"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout 5"
fi
$TIMEOUT_BIN git fetch origin "$DEFAULT_BRANCH" --quiet 2>/dev/null || exit 0

LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0
REMOTE_SHA=$(git rev-parse "origin/$DEFAULT_BRANCH" 2>/dev/null) || exit 0

[ "$LOCAL_SHA" = "$REMOTE_SHA" ] && exit 0

BEHIND_COUNT=$(git rev-list --count "HEAD..origin/$DEFAULT_BRANCH" 2>/dev/null) || BEHIND_COUNT="some"
BEHIND_LOG=$(git log --oneline "HEAD..origin/$DEFAULT_BRANCH" 2>/dev/null | head -5)

jq -n \
  --arg count "$BEHIND_COUNT" \
  --arg local "${LOCAL_SHA:0:7}" \
  --arg remote "${REMOTE_SHA:0:7}" \
  --arg log "$BEHIND_LOG" \
  --arg branch "$DEFAULT_BRANCH" \
  '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: (
        "The design-system/ submodule is \($count) commit(s) behind origin/\($branch) (pinned: \($local), latest: \($remote)).\nRecent upstream commits:\n\($log)\n\nAt the start of this session, ask the user whether to update now (git submodule update --remote design-system, then check design-system/COMPONENTS.md and design-system/docs/card-reference.md for anything new before using them) or stay on the pinned version for now. Don'\''t update silently either way — this is a one-time touchbase for this session, not a per-task check."
      )
    }
  }'
