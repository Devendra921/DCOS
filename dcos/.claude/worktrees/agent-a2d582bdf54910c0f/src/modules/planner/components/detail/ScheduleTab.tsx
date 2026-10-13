/* Schedule tab: long-lead items, gates and permits against the first phase go-live. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { LeadTimeGantt } from '../charts';
import type { ScheduleItem } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { Stat } from '../kit';
import { Muted, SourcedValue, type PlanView } from './shared';

const KIND_TONE = { equipment: 'info', gate: 'purple', permit: 'orange' } as const;
const PERMIT_TONE: Record<T.PlannerPermit['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = { 'Not started': 'neutral', Applied: 'info', 'In review': 'warning', Approved: 'success', Expired: 'error' };

export function ScheduleTab({ v }: { v: PlanView }) {
  const { ev, plan } = v;
  const first = useMemo(() => [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive))[0], [plan.phases]);
  const goLive = first?.goLive ?? plan.targetGoLive;
  const late = ev.schedule.filter(s => s.late);
  const equipment = ev.schedule.filter(s => s.kind === 'equipment');
  const longest = equipment.reduce<ScheduleItem | undefined>((a, s) => (!a || s.leadWeeks > a.leadWeeks ? s : a), undefined);
  const cols: ColumnsType<ScheduleItem> = useMemo(() => [
    { title: 'Item', dataIndex: 'item', key: 'item', render: (t: string, r) => <span style={{ fontWeight: 500, color: r.late ? 'var(--vw-color-red-600)' : undefined }}>{t}</span> },
    { title: 'Kind', dataIndex: 'kind', key: 'kind', render: (k: ScheduleItem['kind']) => <VwChip variant={KIND_TONE[k]}>{k}</VwChip> },
    { title: 'Lead', dataIndex: 'leadWeeks', key: 'lead', align: 'right', render: (w: number) => (w ? `${w} wk` : '—') },
    { title: 'Order by', dataIndex: 'orderBy', key: 'order', render: (d: string, r) => (r.kind === 'gate' ? '—' : fmtDate(d)) },
    { title: 'Need by', dataIndex: 'needBy', key: 'need', render: (d: string) => fmtDate(d) },
    { title: 'Status', dataIndex: 'late', key: 'late', render: (l: boolean, r) => (r.kind === 'gate' ? <VwChip variant="neutral">Gate</VwChip> : l ? <VwChip variant="error">Late to order</VwChip> : <VwChip variant="success">On time</VwChip>) },
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
        <Stat label="First go-live" value={fmtDate(goLive)} sub={first?.name ?? 'target date'} />
        <Stat label="Long-lead items" value={equipment.length} sub={longest ? `longest ${longest.item} ${longest.leadWeeks} wk` : 'none in scope'} />
        <Stat label="Late to order" value={late.length} sub={late.length ? late.map(l => l.item).slice(0, 2).join(', ') : 'all items fit'} tone={late.length ? 'bad' : 'ok'} />
        <Stat label="Contingency" value={<SourcedValue s={ev.params['contingencyPct']} unit="%" />} sub="applied to every lead time" />
        <Stat label="Permits" value={plan.permits.length} sub={`${plan.permits.filter(p => p.status === 'Approved').length} approved`} />
      </div>
      <VwCard title="Lead times against go-live" extra={<Muted>order-by dates include {String(ev.params['contingencyPct']?.value ?? 15)}% contingency</Muted>}>
        {ev.schedule.length ? <LeadTimeGantt items={ev.schedule} goLive={goLive} height={Math.max(240, ev.schedule.length * 26 + 60)} /> : <div className="vw-card-description">No phases yet, so there is nothing to schedule.</div>}
      </VwCard>
      <VwCard title="Schedule items" extra={<Muted>{ev.schedule.length} item(s)</Muted>}>
        <Table<ScheduleItem> size="small" rowKey={r => `${r.kind}-${r.item}`} dataSource={ev.schedule} columns={cols} pagination={false} rowClassName={r => (r.late ? 'is-selected' : '')} />
      </VwCard>
      <VwCard title="Permits" extra={<Muted>edit on the Risks tab</Muted>}>
        {plan.permits.length ? <Table<T.PlannerPermit> size="small" rowKey="id" dataSource={plan.permits} columns={permitCols} pagination={false} /> : <div className="vw-card-description">No permits on this plan.</div>}
      </VwCard>
    </div>
  );
}
