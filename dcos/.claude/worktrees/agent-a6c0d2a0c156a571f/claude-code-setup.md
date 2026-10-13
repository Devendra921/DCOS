# Using this design system in another project (Claude Code)

Clone or submodule this repo into your app, then choose one setup:

## Option A (automated) — `/nst-app-bootstrap` skill

Everything in Option A below, done for you: submodule add, `CLAUDE.md` wiring, local skill install for both Claude Code and Cursor, the enforcement hook, the CI check, and a minimal starter page.

```bash
# once per machine, so the skill exists before any app does:
git clone https://github.com/singularity-eco/vw-design-system.git /tmp/vw-design-system
mkdir -p ~/.claude/skills
cp -r /tmp/vw-design-system/.claude/skills/nst-app-bootstrap ~/.claude/skills/
rm -rf /tmp/vw-design-system

# then, per app:
cd your-app
claude
# run: /nst-app-bootstrap
```

Safe to re-run on a repo that's already partially set up — it skips or merges instead of overwriting.

## Option A — Submodule (manual)

```bash
git submodule add https://github.com/singularity-eco/vw-design-system.git design-system
```

Add to your app’s `CLAUDE.md`:

```markdown
## Design system
- Path: `design-system/`
- Before UI work: read `design-system/COMPONENTS.md`
- Stylesheet: `design-system/nst-design-system.css` + Poppins font
- Skill: copy `design-system/.claude/skills/nst-design-system/` to `.claude/skills/`
```

## Option B — Copy skill globally (all projects)

```bash
git clone https://github.com/singularity-eco/vw-design-system.git /tmp/vw-design-system
mkdir -p ~/.claude/skills
cp -r /tmp/vw-design-system/.claude/skills/nst-design-system ~/.claude/skills/
rm -rf /tmp/vw-design-system
```

Point Claude at the cloned `COMPONENTS.md` path in your prompts.

## Option C — Work inside this repo

```bash
git clone https://github.com/singularity-eco/vw-design-system.git
cd vw-design-system
claude
```

`CLAUDE.md` and `/nst-design-system` load automatically. No manual skill install.

## CI enforcement (GitHub Actions)

The `.claude/hooks/check-design-system.sh` hook only fires *inside* a Claude Code session — it
can't catch drift from a human edit, a different tool, or a merge that bypassed the assistant
entirely. A repo-level CI check closes that gap by running the **same rules** (shared via
`.claude/hooks/design-system-rules.sh`) as a real gate on every PR, regardless of what wrote the
code.

If you followed Option A (submodule at `design-system/`), add this file to your app:

```yaml
# .github/workflows/design-system-check.yml
name: Design System Check

on:
  pull_request:

jobs:
  design-system-check:
    uses: singularity-eco/vw-design-system/.github/workflows/design-system-check.yml@main
    with:
      base-sha: ${{ github.event.pull_request.base.sha }}
      head-sha: ${{ github.event.pull_request.head.sha }}
```

`design-system-path` defaults to `design-system`, matching the standard submodule layout — no need
to set it unless your submodule lives somewhere else. `/nst-app-bootstrap` installs this file for
you automatically (see its own step 7); add it manually only if you're wiring things up by hand.

This runs as a real failing check (not a warning) — a violation blocks the PR from showing green,
though a reviewer can still merge past it if a finding turns out to be a genuine false positive
(adjudicate against `COMPONENTS.md`, same as the in-session hook).

## Staying in sync (submodule staleness check)

Git submodules don't auto-sync — pushing a commit here gives an app that already pinned an
older `design-system/` commit no signal at all until someone checks by hand. `/nst-app-bootstrap`
installs a `SessionStart` hook (`.claude/hooks/check-design-system-staleness.sh`) that closes this
gap: once per session start/resume (never per-prompt), it fetches the submodule's remote and, if
the app is behind `origin/main`, tells the agent to ask you whether to update now or later. Silent
whenever there's nothing to report.

If you followed Option A/B/C manually instead of `/nst-app-bootstrap`, add it yourself:

```bash
mkdir -p .claude/hooks
cp design-system/.claude/hooks/check-design-system-staleness.sh .claude/hooks/check-design-system-staleness.sh
chmod +x .claude/hooks/check-design-system-staleness.sh
```

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/check-design-system-staleness.sh 2>/dev/null || true" }
        ]
      }
    ]
  }
}
```

## Verify in Claude Code

```
/skills
```

You should see `nst-design-system`. Run `/nst-design-system` when generating UI.
