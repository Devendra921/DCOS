---
name: nst-design-system
description: Generates Vision Waves NST enterprise UI from repo components only. Use when building dashboards, KPI cards, admin consoles, HTML mocks, forms, tables, or React/SPA UI. Reads COMPONENTS.md, uses nst-design-system.css and vw-card/vw-chip classes. Never invent random designs.
---

# NST Design System

This is a **project-local pointer**, not the source of truth. Full workflow, class registry,
hard rules, KPI template, and the React/SPA usage section live in:

- **`/SKILL.md`** (repo root) — full skill doc
- **`/COMPONENTS.md`** (repo root) — component registry, Layer 1/2 tables, Framework usage section

Read both before generating any UI. Do not restate their content here — edit those two files
directly so this pointer and the `.cursor/skills/nst-design-system/SKILL.md` copy never drift
out of sync.

## Quick workflow

1. Read `COMPONENTS.md` — if the component exists (cards, chips, inputs, `nst-table`, etc.), use it
2. Read the reference CSS + `preview/*.html` it points to
3. Generate with those classes/tokens only — HTML or React (`className`), same classes either way
4. Self-check against the Forbidden list in `COMPONENTS.md` before finishing
