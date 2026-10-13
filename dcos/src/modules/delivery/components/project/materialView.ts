/* Pure helpers and the lookup hook behind the materials views (materials.tsx): step order, late
   tests, labels and an index of catalogue items, ERP order lines, orders and work orders. */
import { useMemo } from 'react';
import type * as T from '../../../../mock/data/types';
import { useDeliveryData } from '../../lib/chain';
import { processKeyFor, stepKeyOf, stepNameFor, workStepsOf } from '../../lib/projectProcess';
import { lineLate, type MaterialData, type ReadinessView, type StepMaterials } from '../../lib/materialRules';

/** A catalogue lead time at or above this many weeks is called out as long lead. */
export const LONG_LEAD_WEEKS = 8;

/** True when the work's kit is short at the site (readiness Partly ready, Not ready or Late). */
export const kitShort = (v: Pick<ReadinessView, 'state'>) => v.state !== 'Ready' && v.state !== 'Not needed';

/** Same test as readinessOf (materialRules.lineLate). */
export const isLateLine = (l: T.MaterialLine, nowMs = Date.now()) => lineLate(l, nowMs);

/* ------------------------------------------------------------------ steps in process order */
/** The project's steps in process order; lines without a step come last. */
export function orderedSteps(template: string | undefined, steps: StepMaterials[]): StepMaterials[] {
  const key = processKeyFor(template);
  const order = key ? workStepsOf(key).map((s) => s.key) : [];
  const idx = (id: string) => { if (!id) return 1e6; const i = order.indexOf(stepKeyOf(id)); return i < 0 ? 1e5 : i; };
  return [...steps].sort((a, b) => idx(a.stepId) - idx(b.stepId) || a.stepId.localeCompare(b.stepId));
}
export const stepLabel = (template: string | undefined, stepId: string) => (stepId ? stepNameFor(template, stepId) ?? stepId : 'Not tied to a process step');

/* ------------------------------------------------------------------ lookups */
export interface MaterialIndex {
  material: (id: string) => T.Material | undefined;
  poLine: (id?: string) => T.PurchaseOrderLine | undefined;
  po: (id?: string) => T.PurchaseOrder | undefined;
  workOrder: (id?: string) => T.WorkOrder | undefined;
}
export function useMaterialIndex(m: MaterialData): MaterialIndex {
  const d = useDeliveryData();
  return useMemo(() => {
    const mats = new Map(m.materials.map((x) => [x.id, x]));
    const pols = new Map(m.purchaseOrderLines.map((x) => [x.id, x]));
    const pos = new Map(d.purchaseOrders.map((x) => [x.id, x]));
    const wos = new Map(d.workOrders.map((x) => [x.id, x]));
    return { material: (id) => mats.get(id), poLine: (id) => (id ? pols.get(id) : undefined), po: (id) => (id ? pos.get(id) : undefined), workOrder: (id) => (id ? wos.get(id) : undefined) };
  }, [m.materials, m.purchaseOrderLines, d.purchaseOrders, d.workOrders]);
}

/* ------------------------------------------------------------------ ERP order lines and receipts */
export const PO_LINE_TONE: Record<T.PurchaseOrderLine['status'], 'info' | 'warning' | 'success' | 'neutral'> = { Open: 'info', 'Partially received': 'warning', Received: 'success', Cancelled: 'neutral' };
/** Lines, items and serials on a goods receipt, in words. */
export const receiptSummary = (g: T.GoodsReceipt) => {
  const qty = g.lines.reduce((a, l) => a + l.quantity, 0), serials = g.lines.reduce((a, l) => a + (l.serials?.length ?? 0), 0);
  return `${g.lines.length} line${g.lines.length === 1 ? '' : 's'}, ${qty} item${qty === 1 ? '' : 's'}${serials ? `, ${serials} serial${serials === 1 ? '' : 's'}` : ''}`;
};
/** An open order line whose supplier date is after need-by, or whose need-by has passed. */
export const isLatePoLine = (l: T.PurchaseOrderLine, nowMs = Date.now()) => l.status !== 'Received' && l.status !== 'Cancelled' && !!((l.eta && l.needBy && l.eta > l.needBy) || (l.needBy && new Date(l.needBy).getTime() < nowMs));
