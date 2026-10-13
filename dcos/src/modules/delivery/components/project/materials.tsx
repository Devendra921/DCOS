/* Materials on the project screens: the kit readiness chip, the material lines of each process
   step, and the ERP's purchase order lines and goods receipts with the prototype's ERP
   simulations. The supply chain platform owns stock, kitting and returns, the ERP owns orders
   and receipts; DCOS shows them read-only here. Readiness is a warning only: it never blocks
   approval or the start of work. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, DatePicker, Modal } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type * as T from '../../../../mock/data/types';
import { VwChip } from '../../../../shared/components/ux';
import { PackageCheck, Receipt, ShoppingCart } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../../ops/ui/kit';
import { useDeliveryData } from '../../lib/chain';
import {
  LINE_STATUS_TONE, READINESS_TONE, fmtQty, linesOfProject, materialsByStep, poLinesOfPo, receiptsOfPo,
  type Readiness, type ReadinessView, type StepMaterials,
} from '../../lib/materialRules';
import { useMaterialActions, useMaterialData } from '../../lib/materialHooks';
import { DataTable, Muted, ToneChip } from './kit';
import { fmtDate } from './format';
import { LONG_LEAD_WEEKS, PO_LINE_TONE, isLateLine, isLatePoLine, orderedSteps, receiptSummary, stepLabel, useMaterialIndex, type MaterialIndex } from './materialView';

/* ------------------------------------------------------------------ readiness chip */
const KIT_LABEL: Record<Readiness, string> = { 'Not needed': 'No materials', Ready: 'Kit at site', 'Partly ready': 'Partly at site', 'Not ready': 'Not at site', Late: 'Late' };
/** Kit readiness as a status chip; the reasons show on hover. Kept as VwChip: it is also shown outside the Operate frame (programme materials). */
export function ReadinessChip({ view }: { view: Pick<ReadinessView, 'state' | 'reasons'> }) {
  return <span title={view.reasons.join('; ') || undefined}><VwChip variant={READINESS_TONE[view.state]}>{KIT_LABEL[view.state]}</VwChip></span>;
}

/** Supplier date, in red when it is after need-by (or need-by has passed and the item is not at the site). */
export function SupplierDate({ eta, late }: { eta?: string; late: boolean }) {
  if (!eta) return <Muted>—</Muted>;
  return <span style={{ color: late ? 'var(--vw-color-red-600)' : undefined }}>{fmtDate(eta)}{late ? <Muted size="xs"> late</Muted> : null}</span>;
}
/** Catalogue lead time, flagged when it is long. */
export function LeadTime({ weeks }: { weeks?: number }) {
  if (!weeks) return <Muted>—</Muted>;
  return weeks >= LONG_LEAD_WEEKS ? <span style={{ color: 'var(--vw-color-amber-700)' }}>{weeks} wk, long lead</span> : <Muted>{weeks} wk</Muted>;
}

/* ------------------------------------------------------------------ material lines by step */
/** Material lines in one table, grouped by process step with each step's readiness and progress. */
export function MaterialLinesByStep({ template, steps, ix, now, empty }: { template?: string; steps: StepMaterials[]; ix: MaterialIndex; now: number; empty?: React.ReactNode }) {
  const rows = steps.flatMap((s) => [...s.lines].sort((a, b) => a.direction.localeCompare(b.direction) || a.description.localeCompare(b.description)));
  const byStep = new Map(steps.map((s) => [s.stepId, s]));
  return (
    <DataTable rows={rows} rowKey={(l) => l.id} empty={empty ?? 'No material lines.'}
      groupBy={{
        key: (l) => l.projectStepId ?? '',
        label: (k) => {
          const s = byStep.get(k)!;
          return (
            <span className="vw-flex vw-items-center vw-gap-sm vw-wrap">
              <span>{stepLabel(template, k)}</span>
              <ReadinessChip view={s.readiness} />
              <Muted>{s.total ? `${s.ordered} ordered · ${s.received} received · ${s.atSite} at site · ${s.used} used, of ${s.total}` : 'nothing incoming'}</Muted>
              {s.readiness.reasons.length > 0 && <Muted>({s.readiness.reasons.join('; ')})</Muted>}
            </span>
          );
        },
      }}
      cols={[
        { key: 'item', title: 'Item', wrap: true, render: (l) => <div>{l.description}<div><Muted size="xs">{ix.material(l.materialId)?.matId ?? l.materialId}{l.direction === 'Out' ? ' · removed from the estate' : ''}</Muted></div></div> },
        { key: 'pn', title: 'Part number', render: (l) => ix.material(l.materialId)?.partNumber ?? <Muted>—</Muted> },
        { key: 'q', title: 'Qty', align: 'right', render: (l) => fmtQty(l.quantity, l.uom) },
        { key: 'src', title: 'Source', render: (l) => l.source },
        { key: 'po', title: 'Order', render: (l) => { const pl = ix.poLine(l.poLineId); if (!pl) return <Muted>{l.source === 'Purchase' ? 'not ordered' : '—'}</Muted>; return <span>{ix.po(pl.poId)?.poId ?? pl.poId} <Muted size="xs">line {pl.lineNo}</Muted></span>; } },
        { key: 'nb', title: 'Need by', render: (l) => fmtDate(l.needBy) },
        { key: 'eta', title: 'Supplier date', render: (l) => <SupplierDate eta={l.eta} late={isLateLine(l, now)} /> },
        { key: 'lead', title: 'Lead time', render: (l) => <LeadTime weeks={ix.material(l.materialId)?.leadWeeks} /> },
        { key: 'st', title: 'Status', render: (l) => <><ToneChip v={LINE_STATUS_TONE[l.status]}>{l.status}</ToneChip>{(l.status === 'Planned' || l.status === 'Ordered') && l.qty.received > 0 ? <div><Muted size="xs">{l.qty.received} of {l.quantity} received</Muted></div> : null}</> },
        { key: 'wo', title: 'Work order', render: (l) => { const w = ix.workOrder(l.workOrderId); return w ? <Link to={`/delivery/work-orders/${w.id}`}>{w.woId ?? w.id}</Link> : <Muted>not taken yet</Muted>; } },
      ]} />
  );
}

/** Project tab card: what each process step needs and how far it has got. */
export function ProjectMaterialsCard({ project }: { project: T.Project }) {
  const m = useMaterialData();
  const ix = useMaterialIndex(m);
  const [now] = useState(() => Date.now());
  const steps = useMemo(() => orderedSteps(project.template, materialsByStep(linesOfProject(m, project.id), now)), [m, project.id, project.template, now]);
  const total = steps.reduce((a, s) => a + s.total, 0);
  const atSite = steps.reduce((a, s) => a + s.atSite, 0);
  const late = steps.reduce((a, s) => a + s.readiness.late.length, 0);
  return (
    <Panel title="Materials by process step" icon={PackageCheck} sub={total ? `${atSite} of ${total} items at site${late ? ` · ${late} late` : ''}` : 'none planned'}>
      <div className="col" style={{ gap: 8 }}>
        <div className="vw-card-description">What each process step needs, from the bill of materials. The ERP holds the orders; the supply chain platform holds the stock and delivers each work order's kit to the site. Kit readiness is a warning only: it never stops a change being approved or work starting.</div>
        <MaterialLinesByStep template={project.template} steps={steps} ix={ix} now={now}
          empty={m.ready ? 'No material lines yet. They are planned per process step from the bill of materials once procurement is generated.' : 'Loading materials…'} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ ERP order lines and receipts */
const FromErp = () => <Chip tone="neutral">From ERP</Chip>;

/**
 * Purchase order lines and goods receipts mirrored from the ERP for the given orders, with the
 * prototype's simulations of what the ERP would send (a receipt, a new supplier date).
 */
export function ErpOrdersCards({ pos, simulate = true }: { pos: T.PurchaseOrder[]; simulate?: boolean }) {
  const { message } = App.useApp();
  const m = useMaterialData();
  const ops = useMaterialActions();
  const d = useDeliveryData();
  const [now] = useState(() => Date.now());
  const [etaFor, setEtaFor] = useState<T.PurchaseOrderLine | null>(null);
  const [eta, setEta] = useState<Dayjs | null>(null);
  const mats = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials]);
  const poById = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const lines = useMemo(() => pos.flatMap((p) => poLinesOfPo(m, p.id)), [pos, m]);
  const receipts = useMemo(() => pos.flatMap((p) => receiptsOfPo(m, p.id)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [pos, m]);
  const site = (id?: string) => { const x = d.dataCenters.find((c) => c.id === id); return x ? x.name : '—'; };

  const receive = (po: T.PurchaseOrder) => {
    try { const gr = ops.simulateGoodsReceipt(po.id); if (gr) message.success(`Receipt ${gr.grId} posted against ${po.poId}`); else message.info(`Nothing left to receive on ${po.poId}`); }
    catch (e) { message.error((e as Error).message); }
  };
  const changeEta = () => {
    if (!etaFor || !eta) return;
    try { ops.simulateEtaChange(etaFor.id, eta.endOf('day').toISOString()); message.success(`Supplier date for line ${etaFor.lineNo} is now ${fmtDate(eta.toISOString())}`); setEtaFor(null); }
    catch (e) { message.error((e as Error).message); }
  };

  return (
    <>
      <Panel title="Purchase order lines" icon={ShoppingCart} sub={`${lines.length} lines on ${pos.length} orders, read-only`} actions={<FromErp />}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">The ERP is the system of record for orders, supplier dates and receipts. {simulate ? 'Buttons marked "Prototype: simulate" stand in for messages the ERP would send; they are not part of the real product.' : ''}</div>
          <DataTable rows={lines} rowKey={(l) => l.id} empty={m.ready ? 'No order lines from the ERP for these purchase orders yet.' : 'Loading…'}
            groupBy={{
              key: (l) => l.poId,
              label: (k, rs) => {
                const po = poById.get(k);
                const open = rs.some((l) => l.status === 'Open' || l.status === 'Partially received');
                const n = receiptsOfPo(m, k).length;
                return (
                  <span className="vw-flex vw-items-center vw-justify-between vw-gap-sm vw-wrap">
                    <span className="vw-inline-flex vw-items-center vw-gap-sm vw-wrap">
                      <span>{po?.poId ?? k}</span>
                      <Muted>{d.vendors.find((v) => v.id === po?.vendorId)?.name ?? 'no vendor'} · need by {fmtDate(po?.needBy)} · {n ? `${n} receipt${n === 1 ? '' : 's'}` : 'nothing received'}</Muted>
                    </span>
                    {simulate && po && (
                      <span className="vw-inline-flex vw-items-center vw-gap-xs">
                        <Muted size="xs">Prototype: simulate</Muted>
                        <Btn size="xs" disabled={!open} onClick={() => receive(po)}>Simulate ERP receipt</Btn>
                      </span>
                    )}
                  </span>
                );
              },
            }}
            cols={[
              { key: 'n', title: 'Line', align: 'right', width: 48, render: (l) => l.lineNo },
              { key: 'i', title: 'Item', wrap: true, render: (l) => { const x = mats.get(l.materialId); return x ? <div>{x.description}<div><Muted size="xs">{x.partNumber} · {x.manufacturer}</Muted></div></div> : <Muted>{l.materialId}</Muted>; } },
              { key: 'q', title: 'Ordered', align: 'right', render: (l) => l.quantity },
              { key: 'r', title: 'Received', align: 'right', render: (l) => l.receivedQty },
              { key: 'st', title: 'Status', render: (l) => <ToneChip v={PO_LINE_TONE[l.status]}>{l.status}</ToneChip> },
              { key: 'nb', title: 'Need by', render: (l) => fmtDate(l.needBy) },
              { key: 'eta', title: 'Supplier date', render: (l) => <SupplierDate eta={l.eta} late={isLatePoLine(l, now)} /> },
              { key: 'ref', title: 'ERP ref', render: (l) => <Muted>{l.erpRef}</Muted> },
              ...(simulate ? [{ key: 'sim', title: <Muted size="xs">Prototype: simulate</Muted>, render: (l: T.PurchaseOrderLine) => (l.status === 'Received' || l.status === 'Cancelled' ? <Muted>—</Muted>
                : <Btn size="xs" onClick={() => { setEtaFor(l); setEta(dayjs(l.eta ?? l.needBy ?? undefined).add(14, 'day')); }}>Supplier date changed</Btn>) }] : []),
            ]} />
        </div>
      </Panel>

      <Panel title="Goods receipts" icon={Receipt} count={receipts.length} sub="Newest first, read-only" actions={<FromErp />}>
        <DataTable rows={receipts} rowKey={(g) => g.id} empty="No goods receipts posted against these orders yet."
          cols={[
            { key: 'id', title: 'Receipt', render: (g) => g.grId },
            { key: 'po', title: 'Order', render: (g) => poById.get(g.poId)?.poId ?? g.poId },
            { key: 'at', title: 'Received', render: (g) => fmtDate(g.receivedAt) },
            { key: 's', title: 'Site', render: (g) => site(g.dataCenterId) },
            { key: 'w', title: 'What', wrap: true, render: (g) => receiptSummary(g) },
            { key: 'ref', title: 'ERP ref', render: (g) => <Muted>{g.erpRef}</Muted> },
          ]} />
      </Panel>

      <Modal open={!!etaFor} title="Prototype: supplier date changed" okText="Simulate" onOk={changeEta} onCancel={() => setEtaFor(null)} okButtonProps={{ disabled: !eta }} destroyOnHidden>
        {etaFor && (
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <div className="vw-card-description">Stands in for the ERP reporting a new supplier date for line {etaFor.lineNo} of {poById.get(etaFor.poId)?.poId ?? etaFor.poId}. A date after the need-by date ({fmtDate(etaFor.needBy)}) marks the material late and raises "Delivery delayed" on the project's process.</div>
            <DatePicker value={eta} onChange={setEta} style={{ width: '100%' }} placeholder="New supplier date" />
          </div>
        )}
      </Modal>
    </>
  );
}
