# Component registry

**Read this before generating any UI.** If a component exists here, you MUST use it. Do not invent styles, colors, fonts, or class names.

**Verify visually:** `preview/gallery-index.html` links three verification galleries — `gallery-cards.html`, `gallery-utility.html`, `gallery-atomic.html` — each live-rendering every class in this registry next to its HTML snippet and a full reference table, so you can confirm the installed version matches expectations before shipping.

**Retrofitting an existing app (not building fresh)?** See `SKILL.md` → "Retrofitting an existing app" — read the code first, screenshot the running app, restyle only (never touch data-wiring), then re-verify. Don't rebuild from scratch.

**Composing a card from real production precedent, not guessing at arrangement?** See `docs/card-reference.md` — a modular catalog of header/body/footer pieces and composed archetypes (KPI, entity+status, alert, comparison, profile, etc.), sourced from real production Figma reference. Every piece maps to classes already in this registry — it's a composition guide, not a new component layer.

## Mandatory setup (every HTML page)

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="nst-design-system.css">
```

Optional form/table layer:

```html
<link rel="stylesheet" href="components.css">
```

Optional icon layer (any `<i class="ph ph-*">` usage — table row actions, input prefix icons,
filter triggers, `.vw-card-variance`'s direction icon, etc.):

```html
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
```

[Phosphor Icons](https://phosphoricons.com/) is this design system's icon set — already used
throughout real specimens (`preview/gallery-atomic.html`, `preview/filter-popover.html`,
`assets/icons.md`) via the CDN webfont, but never documented here until now. Default weight:
`regular`; `duotone` for promo/marketing only (see `assets/icons.md`). Don't reach for a different
icon library, an inline-SVG-from-scratch icon, or an emoji — use `<i class="ph ph-{name}">`.

---

## Layer 1 — Legacy / dashboard (default for enterprise apps)

Use for: KPI cards, dashboards, admin consoles, CRM screens, data-dense layouts.

| Need | Use | Reference |
|------|-----|-----------|
| Stylesheet bundle | `nst-design-system.css` | imports all vw layers |
| Card container | `.vw-card-section` | `vw-cards.css`, `preview/vw-cards.html` |
| Nested cards | `.vw-card-parent`, `.vw-card-child`, `.vw-card-child-shaded` | `vw-cards.css` |
| Card title | `.vw-card-title`, `.vw-card-title-lg`, `.vw-card-title-sm` | `vw-cards.css` |
| Card body text | `.vw-card-description` | `vw-cards.css` |
| KPI / metric value | `.vw-card-metric-lg` … `.vw-card-metric-xxxl` | `vw-cards.css`, `preview/kpi-card.html` |
| Metric label | `.vw-card-metric-label`, `.vw-card-metric-label-sub` | `vw-cards.css` |
| Trend / delta | `.vw-card-variance.is-positive\|is-negative\|is-neutral` — tone (color) only, plainly optional `.vw-card-variance-icon` (Phosphor `ph-caret-up`/`ph-caret-down`) for direction; the two are independent — tone is always the caller's business-meaning call, never inferred from which way the icon points (a rising count can still be `is-negative`) | `vw-cards.css`, `preview/kpi-card.html` |
| Semantic card bg | `.vw-card--success\|error\|warning\|info` (+ fuchsia, purple, etc.) | `vw-cards.css` |
| Status chip | `.vw-chip.vw-chip--success\|error\|warning\|info\|neutral` (+ `-solid`) | `vw-chips.css` |
| Page title | `.vw-page-title`, `.vw-page-description` | `vw-cards.css` |
| Layout | `.vw-flex`, `.vw-flex-col`, `.vw-justify-between`, `.vw-page-gap`, `.vw-gap-sm` (gap classes need a flex/grid parent on the same element — see "Common gotcha" below) | `vw-utilities.css` |
| Grid of cards | `.vw-grid.vw-grid-cols-auto-320.vw-gap-xl` | `vw-utilities.css` |
| Clickable card | `.vw-card--clickable` | `vw-cards.css` |
| Status accent strip (color-code a card without tinting the whole surface) | `.vw-card--accent` on host + `.vw-card-accent` first-child div | `vw-cards.css` |
| Card icon slot | `.vw-card-icon-md` + `.vw-chip--neutral` | `vw-cards.css` |
| Colors | `var(--vw-color-*)` | `colors.css` |
| Spacing / radius | `var(--vw-space-*)`, `var(--vw-radius-*)` | `spacing.css` |
| Theme colors | `var(--grayColor*)`, `var(--primaryColor*)` | `theme-tokens.css` |

**Live specimens:** `preview/vw-cards.html`, `preview/kpi-card.html`

---

## Layer 2 — Atomic / form controls (when building inputs, tables, buttons)

Use only when the task needs atomic controls not covered by vw-cards.

| Need | Use | Reference |
|------|-----|-----------|
| Text input | `.nst-input`, `.nst-input-label` | `components.css`, `preview/inputs-states.html` |
| Input shell (prefix/suffix) | `.nst-input-shell` | `components.css` |
| Textarea | `.nst-textarea`, `.nst-textarea-wrap` | `components.css`, `preview/textarea.html` |
| Table (grid-of-divs — resizable/virtualisable columns) | `.nst-table-card`, `.nst-table-toolbar`, `.nst-table-head`, `.nst-table-th`, `.nst-table-row`, `.nst-table-td` | `components.css`, `preview/table.html` |
| Table (real `<table>` — prefer for plain data grids, keeps screen-reader row/column semantics) | `.nst-table` on the `<table>`, always wrapped in `.nst-table-wrap` (handles horizontal overflow — `.nst-table`'s own `th`/`td` are `white-space: nowrap`, so a wide table needs this to scroll in place instead of pushing the page wider; don't put `overflow-x`/`display:block` on `.nst-table` itself, that touches the box type this variant exists to keep as a real `<table>`); plain `<tr>`, `.is-clickable`, `.is-selected` | `components.css`, `preview/table-semantic.html` |
| Table toolbar search (collapsible) | `.nst-table-search` (+ `.is-open`), `.nst-table-search-icon`, `.nst-table-search-clear` | `components.css`, `preview/table.html` |
| Icon-only button (filter, actions trigger) | `.nst-icon-btn` (+ `.is-active`) | `components.css`, `preview/table.html` |
| Table row actions (kebab) — **note:** the drop-menu is clipped by the table card's / cell's `overflow: hidden` (used for column truncation), so in a real grid table it must be portalled/rendered outside the row rather than nested in the `.nst-table-td` | `.nst-table-kebab`, `.nst-table-menu`, `.nst-table-menu-item` | `components.css`, `preview/table.html` |
| Table status badge | `.vw-chip.vw-chip--success\|warning\|...` (reuse Layer 1 chips) | `vw-chips.css` |
| Tile view for table data | `.vw-grid.vw-grid-cols-2\|3\|4` + `.vw-card-section` tiles | `vw-utilities.css`, `preview/table.html` |
| Action menu (generic dropdown — also used for the table toolbar's Actions trigger) | `.nst-action-menu`, `.nst-action-menu-item`, `.nst-action-menu-divider` | `components.css`, `preview/action-menu.html` |
| Surface | `.nst-surface`, `.nst-surface--raised` | `components.css` |
| Buttons | `.nst-btn` + variant (`--filled\|--gray\|--ghost\|--action\|--danger\|--danger-subtle`, default = outline) + size (`--xs\|--sm\|--md\|--lg`, default = md) | `components.css`, `preview/buttons-styles.html`, `buttons-sizes.html` |
| Checkbox / radio / toggle | preview specimens **(no shipped class — see "Known registry gaps" below)** | `preview/selection-controls.html` |
| Chips (Figma pastel) | preview specimens | `preview/chips-status.html` |
| Tabs | preview specimens **(no shipped class — see "Known registry gaps" below)** | `preview/tabs.html` |
| Tooltip | preview specimens | `preview/tooltip.html` |
| Stepper | preview specimens | `preview/stepper.html` |
| Charts | preview specimens | `preview/bar-chart.html`, `preview/line-chart.html` |
| Filter popover | preview specimens | `preview/filter-popover.html` |
| Date picker | `.nst-datepicker` + `.nst-datepicker-{header,nav,grid,day,year-grid,year,time,steppers,footer}` — single date, single date+time, date range, date range+time, each with a collapsed/input state (`.nst-input-shell`) and expanded grid state | `components.css`, `preview/date-picker.html` |
| Colors (Figma semantic) | `colors_and_type.css` tokens | `preview/colors-semantic.html` |

**React prototype:** `ui_kits/admin-console/index.html` (atomic Figma components; Inter font — use only for atomic demos, not dashboard cards)

**`components.jsx`'s `Button`/`Field`/`Chip`/`Timeline` are NOT registered components** — confirmed by reading the source: hardcoded Inter font and raw hex (`#1C81EF`, `#E9E9E9`, `#FF2020`, etc.) throughout, exactly what the Forbidden list below bans. An earlier version of this table listed them as if they were usable, directly contradicting the Framework-usage section's own instruction three headings down not to treat `components.jsx` as the design-system React layer. If you need a button/input/chip in React: bind the real `.nst-btn`/`.nst-input`/`.vw-chip` classes via `className` (see "Framework usage" below) — there is no separate React component set to reach for instead. Timeline has no registered equivalent at all yet — see "Known registry gaps."

---

## Decision tree

```
Building UI?
├─ Dashboard / KPI / card grid / enterprise screen
│  └─ Layer 1 ONLY (nst-design-system.css + vw-* classes)
├─ Form + table page inside enterprise app
│  └─ Layer 1 layout + Layer 2 inputs/tables (components.css)
└─ Standalone atomic component demo
   └─ Layer 2 preview/*.html or components.jsx as reference
```

---

## Framework usage — HTML vs React / SPA

`vw-*` and `nst-*` classes are plain CSS — they work identically as `className` in JSX/TSX. No React-specific port exists or is needed for Layer 1/2 classes themselves.

```jsx
function KpiCard({ title, value, delta }) {
  return (
    <div className="vw-card-section vw-flex vw-flex-col vw-justify-between" style={{ maxWidth: 300 }}>
      <div className="vw-card-title">{title}</div>
      <div className="vw-flex vw-justify-between vw-items-baseline vw-gap-sm">
        <div className="vw-card-metric-lg">{value}</div>
        <div className={`vw-card-variance ${delta >= 0 ? 'is-positive' : 'is-negative'}`}>{delta}%</div>
      </div>
    </div>
  );
}
```

- Load the stylesheet once at the app root (bundler `import 'nst-design-system.css'`, or a `<link>` in `index.html`) — same bundle as HTML, no per-component import.
- Wrap markup in your own React components for reuse; bind the exact class strings from the tables above, don't invent new ones.
- **Do not** treat `ui_kits/admin-console/components.jsx` as the design-system React layer. It's a separate Figma-atomic prototype — Inter font, inline styles, no `vw-*`/`nst-*` classes — scoped to atomic component demos only (see Layer 2 table and CLAUDE.md's "Do not" list). For SPA ideation, generate components against `vw-*`/`nst-*` classes directly instead.

---

## Filling a gap in the utility layer

If a specific need (a bespoke font-size, font-weight, or line-height) has no `vw-*`/`nst-*` class
to cover it — `vw-utilities.css` has spacing/layout utilities but no typography utility layer yet —
do **not** invent a new class or a parallel micro-utility system (`.pg-text-10-5`, `.my-fs-13`, a
whole `.pg-*`-prefixed family defined in a local `<style>` block, etc.). That fragments the class
system exactly like the things this registry forbids, just via a back door.

Instead:

1. Snap to the nearest existing `var(--vw-font-*)` / `var(--vw-line-*)` / `var(--vw-space-*)` token
   and apply it via inline style (e.g. `style="font-size: var(--vw-font-label-sm)"`) — even if it's
   not a pixel-perfect match to whatever you're copying from.
2. Only if no token is remotely close, use a literal inline value — but say so explicitly and flag
   it as a registry gap worth closing, rather than silently inventing a class name for it.

---

## Common gotcha — `.vw-page-gap`/`.vw-gap-*` need a flex or grid parent

`.vw-page-gap` and every `.vw-gap-*` variant compile to nothing but `gap: var(--vw-space-*)`. The
`gap` property only does anything on an element that's *also* `display: flex` or `display: grid` —
on a plain block element it's silently accepted and does **nothing**: no console error, no visual
difference from omitting the class entirely, and the enforcement hook sees a correctly-spelled
registry class and stays quiet. This has actually shipped: a fresh-transform run applied
`.vw-page-gap` straight to a `.content` wrapper, and the intended section spacing simply never
appeared until the element also got `.vw-flex .vw-flex-col`.

**Always pair a `.vw-page-gap`/`.vw-gap-*` class with a display class on the same element** —
`.vw-flex` (+ `.vw-flex-col` for vertical stacks), `.vw-inline-flex`, or `.vw-grid` — never apply it
to a bare block element and assume the class name alone is doing the layout work:

```html
<!-- correct: gap has a flex container to act on -->
<div class="vw-flex vw-flex-col vw-page-gap">...</div>

<!-- silent no-op: gap is set, but this div is still display:block -->
<div class="vw-page-gap">...</div>
```

The enforcement hook has a heuristic check for this (a `vw-gap`-family token with no `vw-flex`/
`vw-inline-flex`/`vw-grid` token on the same element) — but it can only see class attributes, not an
equivalent `style="display:flex"`, so treat it as a backstop, not a substitute for checking this
yourself when using the gap utilities.

---

## Known registry gaps

Consolidated from independent audits of two separately-built consuming apps (Sample-thread's
`Dev-Sec-Ops-V4` transform, and an `admin-dashboard` fresh build) — no shipped `.vw-*`/`.nst-*`
class exists for any of these; where a `preview/*.html` file exists for one, it's an inline-style
demo, not a real component. Build these page-local, token-only, per "Filling a gap in the utility
layer" above — do not invent a parallel class system for them.

**Recurred on 2+ independently-built apps — the "Promoting a page-local pattern" bar below is
already met for these three.** Don't promote unilaterally even so; this just means they're real
candidates the next time this file gets a sign-off review:
- **App shell** (sidebar nav + topbar)
- **Modal / Drawer**
- **Toast**

**Seen on one app so far** (not yet at the cross-page-recurrence bar):
- Avatar (single + stacked group with overflow)
- Checkbox / radio / toggle switch (styled, not just the inline demo)
- Tabs (styled, not just the inline demo)
- Timeline / comment thread
- `<select>` dropdown
- Pagination
- Skeleton loading rows
- Confirm dialog
- Empty state pattern
- Loading spinner (submit-button state)
- Sortable column header affordance (icon + click target for a `<th>`)
- "Danger"/urgency text treatment outside of a chip (e.g. an overdue date) — only semantic option
  today is wrapping it in a `.vw-chip--error`, which isn't always the right shape
- Multi-select / combobox (distinct from the plain `<select>` gap above — no multi-value selection
  pattern of any kind exists yet)
- Rating (star) — confirmed real in the legacy `core-ui` component library (`rating-star`), not just
  something a consuming app happened to invent: a row of star icons, empty state in a neutral gray,
  filled/hover in gold. Until built, fall back to existing tokens rather than a hardcoded gold hex —
  `--vw-color-amber-400` already covers the same intent, `--vw-color-gray-300` for the empty state
- Progress meter, heatmap, activity feed, sparkline/chart primitives, segmented control, filter
  chip, sub-12px type scale (from the `Dev-Sec-Ops-V4` transform specifically)

If you hit a gap not listed here, add it under the appropriate bucket rather than silently
building around it unlogged — that's how the first three above became visible as real candidates
instead of staying siloed in one app's private notes.

---

## Promoting a page-local pattern into the registry

Sometimes a page genuinely needs a composite pattern this registry doesn't have yet — a KPI card
with an icon badge and a sparkline, a labeled progress bar, an activity-feed row. Building one
correctly (using existing `var(--vw-color-*)`/`var(--vw-space-*)`/`var(--vw-radius-*)` tokens
throughout, no arbitrary values) is fine and expected — that's not the same failure mode as
inventing a utility layer. But a well-behaved page-local pattern still isn't a registry component,
and the two get confused easily because both look "clean."

**The bar for promoting one is cross-page recurrence, not within-page repetition.** A KPI card
repeating four times on one dashboard is evidence that page needed four KPI cards — it is not
evidence the pattern will generalize. Wait until the same pattern shows up on a *second*,
independently-built page before treating it as a real candidate. Until then, leave it as page-local
CSS and say so explicitly (e.g. "this stepper isn't a registered component yet — built as
page-local CSS, extending `preview/stepper.html`'s sketch; if it recurs, that's the signal to
promote it").

**When it does recur, validate before promoting:**

1. If an independent reference for the same design language exists (an older copy of this design
   system elsewhere, a source-of-truth Figma file, a reference implementation), cross-check the
   pattern against it. Confirming the same shape already exists there is much stronger evidence
   than "I've now typed similar CSS twice."
2. Confirm the recurrence is real and independent — the same pattern appearing across pages that
   were built/reviewed separately (not copy-pasted from one another in the same sitting).
3. **Never promote unilaterally.** Adding to this registry changes what every project consuming it
   is told to use — treat it exactly like the Deviation policy below: name the pattern, name where
   it recurred, propose the class name and token usage, and get explicit sign-off before it lands
   in `vw-cards.css`/`vw-utilities.css`/`components.css` and this file.

## Forbidden (rejected by default — see Deviation policy below)

- Random hex colors not from `colors.css` or `theme-tokens.css`
- Custom card CSS when `.vw-card-*` exists
- Inter or system fonts on legacy/dashboard pages (use Poppins)
- `colors_and_type.css` for dashboard cards (wrong layer)
- Tailwind / Bootstrap / Material UI classes
- Invented class names (`card`, `kpi-box`, `status-badge`, `btn-primary`, etc.) when vw/nst equivalents exist
- A locally-defined parallel utility-class system (any non-`vw-`/`nst-` prefixed family of classes in a `<style>` block) used to work around a registry gap — use tokens directly instead (see "Filling a gap in the utility layer" above)
- Inline `style="color: #..."` except layout constraints (`max-width`, `grid-template-columns`)

---

## Deviation policy — when a user explicitly asks to break a rule

The rules above are the default for every UI task, regardless of which agent or tool is reading this file (Claude Code, Cursor, or anything else). Defaults aren't absolute, though:

- If the task can be done within the registry, just do it — don't ask permission for normal work.
- If a user's request would require violating a rule above (an off-palette color, a non-Poppins font, Tailwind, an invented class, skipping a component that already exists), do **not** silently comply and do **not** silently refuse. Instead:
  1. **Name the specific rule** being crossed and why it exists (e.g., "that's Tailwind, which is forbidden here because it fragments the class system this repo is built to give every project a single source of truth for").
  2. **Ask for explicit confirmation** before writing the deviating code.
  3. If confirmed, implement **exactly what was asked, scoped to that instance only** — it's a one-off exception, not a new precedent. Don't carry the deviation into other components or future work without being asked again.
  4. If the request is ambiguous, or there's no confirmation, default back to the registry.
