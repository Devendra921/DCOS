/* Schedule tab: long-lead items, gates and permits per phase — where each item comes from (stock or buy), its lead time, the contingency buffer and, after approval, the purchase order behind it. */
import { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip, VwSegmented, fmtDate } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { LeadTimeGantt } from '../charts';
import { datedPhases, type ScheduleItem } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { Stat } from '../kit';
import { Muted, SourcedValue, type PlanView } from './shared';

const KIND_TONE = { equipment: 'info', gate: 'purple', permit: 'orange' } as const;
const SOURCE_TONE = { stock: 'success', site: 'success', procure: 'neutral', mixed: 'cyan' } as const;
const SOURCE_TEXT = { stock: 'Stock (transfer)', site: 'Site', procure: 'Buy', mixed: 'Stock and buy' } as const;
const PERMIT_TONE: Record<T.PlannerPermit['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = { 'Not started': 'neutral', Applied: 'info', 'In review': 'warning', Approved: 'success', Expired: 'error' };

function statusChip(r: ScheduleItem) {
  if (r.kind === 'gate') return <VwChip variant="neutral">Gate</VwChip>;
  if (r.late) return <VwChip variant="error">{r.status === 'late' && r.poId ? 'PO late' : 'Late to order'}</VwChip>;
  if (r.status === 'ordered') return <VwChip variant="success">Ordered</VwChip>;
  if (r.source === 'stock') return <VwChip variant="success">From stock</VwChip>;
  return <VwChip variant="info">On time</VwChip>;
}

export function ScheduleTab({ v }: { v: PlanView }) {
  const { ev, plan } = v;
  const phases = useMemo(() => datedPhases(plan), [plan]);
  const [phaseId, setPhaseId] = useState<string>('all');
  const shown = phaseId === 'all' ? ev.schedule : ev.schedule.filter(s => s.phaseId === phaseId);
  const goLive = phases.find(p => p.id === phaseId)?.goLive ?? phases[0]?.goLive ?? plan.targetGoLive;
  const late = ev.schedule.filter(s => s.late);
  const equipment = ev.schedule.filter(s => s.kind === 'equipment');
  const fromStock = equipment.filter(s => s.source === 'stock').length;
  const longest = equipment.reduce<ScheduleItem | undefined>((a, s) => (!a || s.leadWeeks > a.leadWeeks ? s : a), undefined);
  const approved = ['Approved', 'Executing', 'Completed'].includes(plan.status);
  const cols: ColumnsType<ScheduleItem> = useMemo(() => [
    { title: 'Item', dataIndex: 'item', key: 'item', render: (t: string, r) => <div><div style={{ fontWeight: 500, color: r.late ? 'var(--vw-color-red-600)' : undefined }}>{t}</div>{r.note && <Muted size="xs">{r.note}</Muted>}</div> },
    { title: 'Phase', dataIndex: 'phase', key: 'phase' },
    { title: 'Kind', dataIndex: 'kind', key: 'kind', render: (k: ScheduleItem['kind']) => <VwChip variant={KIND_TONE[k]}>{k}</VwChip> },
    { title: 'Source', dataIndex: 'source', key: 'src', render: (s?: ScheduleItem['source']) => (s ? <VwChip variant={SOURCE_TONE[s]}>{SOURCE_TEXT[s]}</VwChip> : '—') },
    { title: 'Lead', dataIndex: 'leadWeeks', key: 'lead', align: 'right', render: (w: number) => (w ? `${w} wk` : '—') },
    { title: 'Buffer', dataIndex: 'bufferWeeks', key: 'buf', align: 'right', render: (w?: number) => (w ? `${w} wk` : '—') },
    { title: 'Order by', dataIndex: 'orderBy', key: 'order', render: (d: string, r) => (r.kind === 'gate' ? '—' : fmtDate(d)) },
    { title: 'Need by', dataIndex: 'needBy', key: 'need', render: (d: string) => fmtDate(d) },
    { title: 'Purchase order', dataIndex: 'poId', key: 'po', render: (po?: string) => po ?? '—' },
    { title: 'Status', key: 'status', render: (_: unknown, r) => statusChip(r) },
  ], []);
  const permitCols: ColumnsType<T.PlannerPermit> = useMemo(() => [
    { title: 'Permit', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Authority', dataIndex: 'authority', key: 'auth' },
    { title: 'Lead', dataIndex: 'leadWeeks', key: 'lead', align: 'right', render: (w: number) => `${w} wk` },
    { title: 'Apply by', key: 'apply', render: (_: unknown, r) => fmtDate(new Date(new Date(r.neededBefore).getTime() - r.leadWeeks * 7 * 864e5)) },
    { title: 'Needed before', dataIndex: 'neededBefore', key: 'need', render: (d: string) => fmtDate(d) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: T.PlannerPermit['status']) => <VwChip variant={PERMIT_TONE[s]}>{s}</VwChip> },
  ], []);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Phases" value={phases.length} sub={phases.length ? `first live ${fmtDate(phases[0].goLive)}` : 'no dated phase'} tone={phases.length ? undefined : 'bad'} />
        <Stat label="Long-lead items" value={equipment.length} sub={longest ? `longest ${longest.item} ${longest.leadWeeks} wk` : 'none in scope'} />
        <Stat label="From stock" value={fromStock} sub="need a transfer only" />
        <Stat label="Late" value={late.length} sub={late.length ? late.map(l => `${l.item} (${l.phase})`).slice(0, 2).join(', ') : 'all items fit'} tone={late.length ? 'bad' : 'ok'} />
        <Stat label="Buffer" value={<SourcedValue s={ev.params['contingencyPct']} unit="%" />} sub="schedule contingency, shown apart from the lead time" />
      </div>
      <VwCard title="Lead times against go-live" extra={<span className="vw-flex vw-items-center vw-gap-sm">{approved && <Muted>after approval, late = no purchase order or a draft one past its order-by date</Muted>}{phases.length > 1 && <VwSegmented size="small" value={phaseId} onChange={setPhaseId} options={[{ value: 'all', label: 'All phases' }, ...phases.map(p => ({ value: p.id, label: p.name }))]} />}</span>}>
        {shown.length ? <LeadTimeGantt items={shown} goLive={goLive} height={Math.max(240, Math.min(720, shown.length * 26 + 60))} /> : <div className="vw-card-description">No dated phase yet, so there is nothing to schedule.</div>}
      </VwCard>
      <VwCard title="Schedule items" extra={<Muted>{shown.length} item(s)</Muted>}>
        <Table<ScheduleItem> size="small" rowKey={r => `${r.kind}-${r.phaseId ?? ''}-${r.item}`} dataSource={shown} columns={cols} pagination={shown.length > 40 ? { pageSize: 40 } : false} scroll={{ x: 1100 }} rowClassName={r => (r.late ? 'is-selected' : '')} />
      </VwCard>
      <VwCard title="Permits" extra={<Muted>edit on the Risks tab</Muted>}>
        {plan.permits.length ? <Table<T.PlannerPermit> size="small" rowKey="id" dataSource={plan.permits} columns={permitCols} pagination={false} /> : <div className="vw-card-description">No permits on this plan.</div>}
      </VwCard>
    </div>
  );
}
