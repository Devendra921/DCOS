/* Capacity tab: the phase ladder (installed, committed, reserve, headroom per dimension) and what binds first. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { PhaseLadderChart } from '../charts';
import { fmtKw, type LadderRow } from '../../lib/engine';
import { Muted, SourcedValue, monthYear, n0, type PlanView } from './shared';

const BIND_TONE = { power: 'error', cooling: 'error', space: 'warning', grid: 'error', ports: 'warning', none: 'success' } as const;
const BIND_TEXT: Record<LadderRow['bindingConstraint'], string> = {
  power: 'Power binds first: usable headroom falls under 10% of installed capacity after committed load and the reserve. Add plant or lower the reserve policy.',
  cooling: 'Cooling binds first: installed cooling does not cover the committed load with margin. Add cooling units or lower the density.',
  space: 'Space binds first: the halls planned for the phase cannot hold the committed load. Add a hall or raise the hall design load.',
  grid: 'The grid binds first: the phases install more IT than the grid intake can supply at the peak PUE. Get a larger grid offer, an uprate, or move the phase.',
  ports: 'Ports bind first: the fabric runs out of access ports before power does. Add leaf pairs.',
  none: 'No dimension binds: power, cooling, space and the grid all keep headroom through every phase.',
};
const head = (kw: number | undefined, installed: number) => kw === undefined ? '—' : <span style={{ color: kw < installed * 0.1 ? 'var(--vw-color-red-600)' : undefined, fontVariantNumeric: 'tabular-nums' }}>{fmtKw(Math.max(0, kw))}{kw < 0 ? ' short' : ''}</span>;

export function CapacityTab({ v }: { v: PlanView }) {
  const { ev, plan } = v;
  const binding = ev.ladder.find(l => l.bindingConstraint !== 'none');
  const site = ev.ctx.site;
  const cols: ColumnsType<LadderRow> = useMemo(() => [
    { title: 'Phase', key: 'phase', render: (_: unknown, r) => <div><div style={{ fontWeight: 500 }}>{r.phase.name}</div><Muted size="xs">{monthYear(r.phase.goLive)} · {r.phase.status}</Muted></div> },
    { title: 'Installed', dataIndex: 'installedKw', key: 'inst', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Committed', dataIndex: 'committedKw', key: 'com', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Reserve', dataIndex: 'reserveKw', key: 'res', align: 'right', render: (kw: number) => fmtKw(kw) },
    { title: 'Power', key: 'hp', align: 'right', render: (_: unknown, r) => head(r.headrooms?.power, r.installedKw) },
    { title: 'Cooling', key: 'hc', align: 'right', render: (_: unknown, r) => head(r.headrooms?.cooling, r.installedKw) },
    { title: 'Space', key: 'hs', align: 'right', render: (_: unknown, r) => head(r.headrooms?.space, r.installedKw) },
    { title: 'Grid', key: 'hg', align: 'right', render: (_: unknown, r) => head(r.headrooms?.grid, r.installedKw) },
    { title: 'Racks / halls', key: 'rh', align: 'right', render: (_: unknown, r) => `${n0(r.racks)} / ${r.halls}` },
    { title: 'Binding', dataIndex: 'bindingConstraint', key: 'bind', render: (b: LadderRow['bindingConstraint']) => <VwChip variant={BIND_TONE[b]}>{b}</VwChip> },
    { title: 'Months', dataIndex: 'monthsFromNow', key: 'months', align: 'right', render: (m: number, r) => <span>{m}{r.crossesWarningMonth !== undefined && <Muted size="xs"> · warns at {r.crossesWarningMonth}</Muted>}</span> },
  ], []);

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard tone={ev.bindingConstraint === 'none' ? 'success' : ev.bindingConstraint === 'space' ? 'warning' : 'error'} title={<span>Binding constraint: {ev.bindingConstraint}</span>} extra={binding ? <VwChip variant={BIND_TONE[binding.bindingConstraint]}>{binding.phase.name}</VwChip> : <VwChip variant="success">All phases clear</VwChip>}>
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)' }}>{BIND_TEXT[ev.bindingConstraint]}</div>
        {binding && <div style={{ marginTop: 6 }}><Muted>At {binding.phase.name}: {fmtKw(binding.installedKw)} installed, {fmtKw(binding.committedKw)} committed, {fmtKw(binding.reserveKw)} reserve, {fmtKw(binding.headroomKw)} usable headroom{binding.crossesWarningMonth !== undefined ? `; at ${plan.demand.growthPctPerYear}% growth the warning threshold is crossed about ${binding.crossesWarningMonth} months from now` : ''}.</Muted></div>}
        {ev.ladder[0]?.committedBasis && <div style={{ marginTop: 6 }}><Muted size="xs">Committed load: {ev.ladder[0].committedBasis}.</Muted></div>}
      </VwCard>

      {site && (
        <VwCard title={`Site today · ${site.dc.name}`} extra={<VwChip variant={site.headroomItKw > 0 ? 'success' : 'error'}>{fmtKw(site.headroomItKw)} free · binding {site.binding?.label ?? 'none'}</VwChip>}>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Stage</th><th>Redundancy</th><th style={{ textAlign: 'right' }}>Usable</th><th style={{ textAlign: 'right' }}>Load</th><th style={{ textAlign: 'right' }}>Headroom (IT kW)</th><th>Basis</th></tr></thead>
            <tbody>{site.stages.map(s => <tr key={s.key}><td style={{ fontWeight: 500 }}>{s.label}</td><td>{s.redundancy}</td><td style={{ textAlign: 'right' }}>{fmtKw(s.usableKw)}</td><td style={{ textAlign: 'right' }}>{fmtKw(s.loadKw)}</td><td style={{ textAlign: 'right', color: s.headroomItKw < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtKw(Math.max(0, s.headroomItKw))}{s.headroomItKw < 0 ? ' short' : ''}</td><td style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', whiteSpace: 'normal' }}>{s.basis}</td></tr>)}</tbody>
          </table></div>
          <div style={{ marginTop: 6 }}><Muted size="xs">Live draw {fmtKw(site.itLoadKw)} · holds {fmtKw(site.reservedKw)} · approved plans not yet reserved {fmtKw(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(x => x.plnId).join(', ')})` : ''}</Muted></div>
        </VwCard>
      )}

      <VwCard title="Capacity ladder" extra={<div className="vw-flex vw-items-center vw-gap-sm"><Muted>Reserve policy</Muted><SourcedValue s={ev.params['reservePct']} unit="%" /><Muted>· growth {plan.demand.growthPctPerYear}% a year</Muted></div>}>
        {ev.ladder.length === 0 ? <div className="vw-card-description">No phases defined — add phases in the wizard or accept the phasing proposal.</div> : <PhaseLadderChart rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={320} />}
      </VwCard>

      <VwCard title="Headroom by phase" extra={<Muted>after committed load and the reserve</Muted>}>
        <Table<LadderRow> size="small" rowKey={r => r.phase.id} dataSource={ev.ladder} columns={cols} pagination={false} scroll={{ x: 1000 }} />
      </VwCard>
    </div>
  );
}
