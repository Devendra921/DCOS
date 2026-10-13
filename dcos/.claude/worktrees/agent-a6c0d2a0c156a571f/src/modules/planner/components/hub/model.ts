/* Planner hub model helpers: evaluated plan rows, formatters and label maps shared by the hub,
   templates and benchmarks pages. Components live in visuals.tsx. */
import { useMemo } from 'react';
import type { CellStyle } from 'ag-grid-community';
import type { VwChipVariant } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { evaluate, type Evaluation } from '../../lib/engine';
import { useBenchmarks, useEstate, usePlans, useTemplates } from '../../lib/usePlanner';

/** Monospace cell style for codes and keys in AG Grid columns. */
export const MONO_CELL: CellStyle = { fontFamily: 'var(--vw-font-mono, monospace)', fontSize: 12 };
export const BOLD_CELL: CellStyle = { fontWeight: 600 };

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtMonth = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—');
export const fmtNum = (n?: number) => (n === undefined ? '—' : n.toLocaleString('en-US'));

export const KIND_LABEL: Record<T.PlannerTemplateKind, string> = { profile: 'Site type profiles', plan: 'Plan templates', aspect: 'Aspect modules', ruleset: 'Rule sets', benchmarkset: 'Benchmark sets', demand: 'Demand profiles', document: 'Document templates', checklist: 'Checklists', blueprint: 'Blueprints' };
export const KIND_ORDER: T.PlannerTemplateKind[] = ['profile', 'plan', 'aspect', 'ruleset', 'benchmarkset', 'demand', 'document', 'checklist', 'blueprint'];
export const KIND_SHORT: Record<T.PlannerTemplateKind, string> = { profile: 'Profile', plan: 'Plan', aspect: 'Aspect', ruleset: 'Rule set', benchmarkset: 'Benchmark set', demand: 'Demand', document: 'Document', checklist: 'Checklist', blueprint: 'Blueprint' };
export const TEMPLATE_STATUS_TONE: Record<T.PlannerTemplate['status'], VwChipVariant> = { draft: 'warning', published: 'success', deprecated: 'neutral' };
export const SEVERITY_TONE: Record<T.PlannerRuleSeverity, VwChipVariant> = { hard: 'error', soft: 'warning' };
export const CATEGORY_LABEL: Record<T.PlannerBenchmark['category'], string> = { cost: 'Cost', performance: 'Performance', sizing: 'Sizing', leadtime: 'Lead time', staffing: 'Staffing', sustainability: 'Sustainability' };
export const ACTIVE_STATUSES: T.PlannerPlanStatus[] = ['Draft', 'In review', 'Approved', 'Executing'];

/** Every plan evaluated once against the base case (no scenario, no site actuals). */
export interface PlanRow { plan: T.PlannerPlan; ev: Evaluation; site: string; capex: number }
export function usePlanRows(): { rows: PlanRow[]; ready: boolean } {
  const plans = usePlans(); const templates = useTemplates(); const benchmarks = useBenchmarks(); const estate = useEstate();
  return useMemo(() => {
    if (!templates.length) return { rows: [], ready: false };
    const dcById = new Map(estate.dataCenters.map(d => [d.id, d])); const campusById = new Map(estate.campuses.map(c => [c.id, c])); const regionById = new Map(estate.regions.map(r => [r.id, r]));
    const rows = plans.map(plan => {
      const ev = evaluate(plan, null, templates, benchmarks);
      const site = plan.dataCenterId ? dcById.get(plan.dataCenterId)?.name : undefined;
      const campus = plan.campusId ? campusById.get(plan.campusId)?.name : undefined;
      const region = plan.regionId ? regionById.get(plan.regionId)?.name : undefined;
      return { plan, ev, site: site ?? plan.newSiteName ?? campus ?? region ?? '—', capex: ev.estimate.capexTotal };
    });
    return { rows, ready: true };
  }, [plans, templates, benchmarks, estate]);
}

/** Grounding statement per AI capability — what the proposal is computed from. */
export const CAPABILITIES: { key: string; label: string; grounding: string; reads: string }[] = [
  { key: 'intent-to-profile', label: 'Intent to profile', grounding: 'Catalogue keywords in the intent text pick the site type profile; size, scope, tier and cooling are read from the numbers and words in the sentence.', reads: 'Site type catalogue' },
  { key: 'sizing-assistant', label: 'Sizing assistant', grounding: 'Live racks and cooling zones of operational sites of the same DC type: real kW per rack, achieved PUE, and the liquid-cooling threshold from the design rules.', reads: 'DCIM racks, cooling zones, rule R-COOL-02' },
  { key: 'phasing-optimiser', label: 'Phasing optimiser', grounding: 'Supplier lead-time benchmarks against the first phase date, and the phase shares of the chosen demand template.', reads: 'Lead-time benchmarks, demand templates' },
  { key: 'cost-estimator', label: 'Cost calibration', grounding: 'CapEx per kW benchmark band for the site type, and the budgets of delivered programmes of the same type.', reads: 'Benchmark set, delivery programmes' },
  { key: 'risk-predictor', label: 'Risk predictor', grounding: 'Project RAG and status history, open vendor risks, late long-lead items and the cooling choice of the plan.', reads: 'Delivery projects, risk register' },
  { key: 'compliance-check', label: 'Standards check', grounding: 'Rule sets with their standards: organisation design standard, Uptime tiers, ASHRAE envelope, EU reporting; every finding names the rule and the threshold.', reads: 'Rule sets' },
  { key: 'placement-optimiser', label: 'Placement optimiser', grounding: 'Power and U headroom of active racks in the target site, feed redundancy, and the utilisation after placement against the warning and block bands.', reads: 'DCIM racks' },
  { key: 'document-extraction', label: 'Document extraction', grounding: 'Numbers with units found in the pasted text (MW available, tariff, lead weeks, area, lease, density, PUE) with the matched snippet as evidence.', reads: 'Uploaded text' },
  { key: 'copilot', label: 'Plan copilot', grounding: "The plan's own evaluation: sizing, capacity ladder, estimate, findings, schedule and scenarios. It never answers from outside the plan.", reads: 'Plan evaluation' },
];
