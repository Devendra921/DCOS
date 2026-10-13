/* Capacity tab: the phase ladder (installed, committed, reserve, headroom) and the binding constraint. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { PhaseLadderChart } from '../charts';
import { fmtKw, type LadderRow } from '../../lib/engine';
import { Muted, SourcedValue, monthYear, n0, type PlanView } from './shared';

const BIND_TONE = { power: 'error', cooling: 'error', space: 'warning', ports: 'warning', none: 'success' } as const;
const BIND_TEXT: Record<LadderRow['bindingConstraint'], string> = {
  power: 'Power binds first: usable headroom falls under 10% of installed capacity. Add plant or lower the reserve policy.',
  cooling: 'Cooling binds first: installed cooling does not cover the phase load with margin. Add cooling units or lower the density.',
  space: 'Space binds first: the phase needs more racks than the halls planned for it. Add a hall or raise the hall design load.',
  ports: 'Ports bind first: the fabric runs out of access ports before power does. Add leaf pairs.',
  none: 'No dimension binds: power, cooling, space and ports all keep headroom through every phase.',
};

export function CapacityTab({ v }: { v: PlanView }) {
  const { ev, plan } = v;
  const binding = ev.ladder.find(l => l.bindingConstraint !== 'none');
  const cols: ColumnsType<LadderRow> = useMemo(() => [
    { title: 'Phase', key: 'phase', render: (_: unknown, r) => <div><div style={{ fontWeight: 500 }}>{r.phase.name}</div><Muted size="xs">{monthYear(r.phase.goLive)} · {r.phase.status}</Muted></div> },
    { title: 'Installed', dataIndex: 'installedKw', key: 'inst', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Committed', dataIndex: 'committedKw', key: 'com', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Reserve', dataIndex: 'reserveKw', key: 'res', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Headroom', dataIndex: 'headroomKw', key: 'head', align: 'right', render: (kw: number, r) => <span style={{ color: kw < r.installedKw * 0.1 ? 'var(--vw-color-red-600)' : undefined, fontWeight: 500 }}>{fmtKw(kw)}</span> },
    { title: 'Usable', dataIndex: 'usablePct', key: 'use', align: 'right', render: (p: number) => `${p}%` },
    { title: 'Racks / halls', key: 'rh', align: 'right', render: (_: unknown, r) => `${n0(r.racks)} / ${r.halls}` },
    { title: 'Binding', dataIndex: 'bindingConstraint', key: 'bind', render: (b: LadderRow['bindingConstraint']) => <VwChip variant={BIND_TONE[b]}>{b}</VwChip> },
    { title: 'Months', dataIndex: 'monthsFromNow', key: 'months', align: 'right', render: (m: number, r) => <span>{m}{r.crossesWarningMonth !== undefined && <Muted size="xs"> · warns at {r.crossesWarningMonth}</Muted>}</span> },
  ], []);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard tone={ev.bindingConstraint === 'none' ? 'success' : ev.bindingConstraint === 'space' ? 'warning' : 'error'} title={<span>Binding constraint: {ev.bindingConstraint}</span>} extra={binding ? <VwChip variant={BIND_TONE[binding.bindingConstraint]}>{binding.phase.name}</VwChip> : <VwChip variant="success">All phases clear</VwChip>}>
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)' }}>{BIND_TEXT[ev.bindingConstraint]}</div>
        {binding && <div style={{ marginTop: 6 }}><Muted>At {binding.phase.name}: {fmtKw(binding.installedKw)} installed, {fmtKw(binding.committedKw)} committed, {fmtKw(binding.reserveKw)} reserve, {fmtKw(binding.headroomKw)} usable headroom{binding.crossesWarningMonth !== undefined ? `; at ${plan.demand.growthPctPerYear}% growth the warning threshold is crossed about ${binding.crossesWarningMonth} months from now` : ''}.</Muted></div>}
      </VwCard>

      <VwCard title="Capacity ladder" extra={<div className="vw-flex vw-items-center vw-gap-sm"><Muted>Reserve policy</Muted><SourcedValue s={ev.params['reservePct']} unit="%" /><Muted>· growth {plan.demand.growthPctPerYear}% a year</Muted></div>}>
        {ev.ladder.length === 0 ? <div className="vw-card-description">No phases defined — add phases in the wizard or accept the phasing proposal.</div> : <PhaseLadderChart rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={320} />}
      </VwCard>

      <VwCard title="Ladder by phase">
        <Table<LadderRow> size="small" rowKey={r => r.phase.id} dataSource={ev.ladder} columns={cols} pagination={false} />
      </VwCard>
    </div>
  );
}
