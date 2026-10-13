## Design system
- Path: `src/styles/nst-design-system/` (vendored copy of singularity-eco/vw-design-system @ 103e2adea5 — not a git submodule; the submodule registration was removed after it was never checked out and broke the build)
- Before any UI work: read `src/styles/nst-design-system/COMPONENTS.md` — use listed components only
- Stylesheet: `src/styles/nst-design-system/nst-design-system.css` + Poppins font
- Skill: `.claude/skills/nst-design-system/SKILL.md` — invoke `/nst-design-system` when generating UI
- Do not invent colors, cards, chips, or class names — use `.vw-*` classes from the registry
- Updating the design system: re-copy the needed files from https://github.com/singularity-eco/vw-design-system.git at the desired commit into `src/styles/nst-design-system/`
