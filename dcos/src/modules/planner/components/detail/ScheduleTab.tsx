/* Schedule tab: long-lead items, gates and permits per phase — where each item comes from (stock or buy), its lead time, the contingency buffer and, after approval, the purchase order behind it. */
import { useMemo, useState } from 'react';
import { CalendarClock, FileCheck2, ListChecks } from 'lucide-react';
import { fmtDate } from '../../../../shared/components/ux';
import { Chip, Empty, Panel, Seg } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { LeadTimeGantt } from '../charts';
import { datedPhases, type ScheduleItem } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { Muted, SourcedValue, ToneValue, type PlanView } from './shared';

const KIND_TONE = { equipment: 'info', gate: 'purple', permit: 'orange' } as const;
const SOURCE_TONE = { stock: 'success', site: 'success', procure: 'neutral', mixed: 'cyan' } as const;
const SOURCE_TEXT = { stock: 'Stock (transfer)', site: 'Site', procure: 'Buy', mixed: 'Stock and buy' } as const;
const PERMIT_TONE: Record<T.PlannerPermit['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = { 'Not started': 'neutral', Applied: 'info', 'In review': 'warning', Approved: 'success', Expired: 'error' };

function statusChip(r: ScheduleItem) {
  if (r.kind === 'gate') return <Chip tone="neutral">Gate</Chip>;
  if (r.late) return <Chip tone="error">{r.status === 'late' && r.poId ? 'PO late' : 'Late to order'}</Chip>;
  if (r.status === 'ordered') return <Chip tone="success">Ordered</Chip>;
  if (r.source === 'stock') return <Chip tone="success">From stock</Chip>;
  return <Chip tone="info">On time</Chip>;
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
  type Row = ScheduleItem & { id: string };
  const cols: Col<Row>[] = useMemo(() => [
    { key: 'item', header: 'Item', wrap: true, render: r => <span className="cell-2"><span className="vw-card-activity-label" style={{ color: r.late ? 'var(--vw-color-red-600)' : undefined }}>{r.item}</span>{r.note && <small>{r.note}</small>}</span> },
    { key: 'phase', header: 'Phase', render: r => r.phase },
    { key: 'kind', header: 'Kind', render: r => <Chip tone={KIND_TONE[r.kind]}>{r.kind}</Chip> },
    { key: 'src', header: 'Source', render: r => (r.source ? <Chip tone={SOURCE_TONE[r.source]}>{SOURCE_TEXT[r.source]}</Chip> : '—') },
    { key: 'lead', header: 'Lead', align: 'right', render: r => <span className="num">{r.leadWeeks ? `${r.leadWeeks} wk` : '—'}</span> },
    { key: 'buf', header: 'Buffer', align: 'right', render: r => <span className="num">{r.bufferWeeks ? `${r.bufferWeeks} wk` : '—'}</span> },
    { key: 'order', header: 'Order by', render: r => <span className="num">{r.kind === 'gate' ? '—' : fmtDate(r.orderBy)}</span> },
    { key: 'need', header: 'Need by', render: r => <span className="num">{fmtDate(r.needBy)}</span> },
    { key: 'po', header: 'Purchase order', render: r => <span className="mono">{r.poId ?? '—'}</span> },
    { key: 'status', header: 'Status', render: r => statusChip(r) },
  ], []);
  const permitCols: Col<T.PlannerPermit>[] = useMemo(() => [
    { key: 'name', header: 'Permit', render: r => <span className="vw-card-activity-label">{r.name}</span> },
    { key: 'auth', header: 'Authority', render: r => r.authority },
    { key: 'lead', header: 'Lead', align: 'right', render: r => <span className="num">{r.leadWeeks} wk</span> },
    { key: 'apply', header: 'Apply by', render: r => <span className="num">{fmtDate(new Date(new Date(r.neededBefore).getTime() - r.leadWeeks * 7 * 864e5))}</span> },
    { key: 'need', header: 'Needed before', render: r => <span className="num">{fmtDate(r.neededBefore)}</span> },
    { key: 'status', header: 'Status', render: r => <Chip tone={PERMIT_TONE[r.status]} dot>{r.status}</Chip> },
  ], []);
  const rows = useMemo<Row[]>(() => shown.map(r => ({ ...r, id: `${r.kind}-${r.phaseId ?? ''}-${r.item}` })), [shown]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid cols={5}>
        <StatTile label="Phases" value={<ToneValue tone={phases.length ? undefined : 'bad'}>{phases.length}</ToneValue>} sub={phases.length ? `first live ${fmtDate(phases[0].goLive)}` : 'no dated phase'} />
        <StatTile label="Long-lead items" value={equipment.length} sub={longest ? `longest ${longest.item} ${longest.leadWeeks} wk` : 'none in scope'} />
        <StatTile label="From stock" value={fromStock} sub="need a transfer only" />
        <StatTile label="Late" value={<ToneValue tone={late.length ? 'bad' : 'ok'}>{late.length}</ToneValue>} sub={late.length ? late.map(l => `${l.item} (${l.phase})`).slice(0, 2).join(', ') : 'all items fit'} />
        <StatTile label="Buffer" value={<SourcedValue s={ev.params['contingencyPct']} unit="%" />} sub="schedule contingency, shown apart from the lead time" />
      </StatGrid>
      <Panel icon={CalendarClock} title="Lead times against go-live" sub={approved ? 'after approval, late = no purchase order or a draft one past its order-by date' : undefined}
        actions={phases.length > 1 ? <Seg<string> size="sm" value={phaseId} onChange={setPhaseId} options={[{ id: 'all', label: 'All phases' }, ...phases.map(p => ({ id: p.id, label: p.name }))]} /> : undefined}>
        {shown.length ? <LeadTimeGantt items={shown} goLive={goLive} height={Math.max(240, Math.min(720, shown.length * 26 + 60))} /> : <Muted>No dated phase yet, so there is nothing to schedule.</Muted>}
      </Panel>
      <Panel flush icon={ListChecks} title="Schedule items" count={shown.length}>
        <DataTable rows={rows} cols={cols} pageSize={shown.length > 40 ? 40 : 200} rowClass={r => (r.late ? 'is-selected' : '')}
          empty={<Empty icon={ListChecks} title="Nothing to schedule">No dated phase yet.</Empty>} />
      </Panel>
      <Panel flush icon={FileCheck2} title="Permits" sub="edit on the Risks tab" count={plan.permits.length}>
        <DataTable rows={plan.permits} cols={permitCols} pageSize={200} empty={<Empty icon={FileCheck2} title="No permits">No permits on this plan.</Empty>} />
      </Panel>
    </div>
  );
}
