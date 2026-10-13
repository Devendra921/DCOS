/**
 * Capability keys — the permission contract.
 *
 * A feature declares the capability it needs; a perspective opts in. Surfaces
 * call `can(CAP.x)` — never an inline role-name check.
 *
 * Grouped by verb: view.* · edit.* · approve.* · manage.* · govern.* · config.*
 */

export const CAP = {
  // ── view.* — what data classes are visible ──────────────────────
  viewStrategic: 'view.strategic',     // rollout analytics, velocity, risk
  viewCommercial: 'view.commercial',   // CAPEX/OPEX, cost, revenue, margin
  viewOperations: 'view.operations',   // execution tracking, blockers, SLA
  viewField: 'view.field',             // mobile field workflows
  viewAudit: 'view.audit',             // audit log, compliance evidence

  // ── edit.* — contribution rights ────────────────────────────────
  editSite: 'edit.site',
  editDesign: 'edit.design',           // RF / TX / power design artefacts
  editFieldData: 'edit.fielddata',     // checklists, photos, field forms

  // ── approve.* — sign-off authority ──────────────────────────────
  approveRebaseline: 'approve.rebaseline',
  approveDesign: 'approve.design',
  approvePayment: 'approve.payment',
  approveColocation: 'approve.colocation',
  approveReadiness: 'approve.readiness',
  approveCloseout: 'approve.closeout',

  // ── manage.* / govern.* ─────────────────────────────────────────
  manageCrew: 'manage.crew',
  manageProgram: 'manage.program',
  governPmo: 'govern.pmo',

  // ── config.* — system ───────────────────────────────────────────
  configSystem: 'config.system',
  actAsRole: 'act-as-role',
} as const;

export type CapabilityKey = (typeof CAP)[keyof typeof CAP];
