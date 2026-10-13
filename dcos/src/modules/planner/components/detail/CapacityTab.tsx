/* Capacity tab: the phase ladder (installed, committed, reserve, headroom per dimension) and what binds first. */
import { useMemo } from 'react';
import { Building2, ChartColumn, Gauge, Layers } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
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
  const cols: Col<LadderRow & { id: string }>[] = useMemo(() => [
    { key: 'phase', header: 'Phase', render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.phase.name}</span><small>{monthYear(r.phase.goLive)} · {r.phase.status}</small></span> },
    { key: 'inst', header: 'Installed', align: 'right', render: r => <span className="num">{fmtKw(r.installedKw)}</span> },
    { key: 'com', header: 'Committed', align: 'right', render: r => <span className="num">{fmtKw(r.committedKw)}</span> },
    { key: 'res', header: 'Reserve', align: 'right', render: r => <span className="num">{fmtKw(r.reserveKw)}</span> },
    { key: 'hp', header: 'Power', align: 'right', render: r => head(r.headrooms?.power, r.installedKw) },
    { key: 'hc', header: 'Cooling', align: 'right', render: r => head(r.headrooms?.cooling, r.installedKw) },
    { key: 'hs', header: 'Space', align: 'right', render: r => head(r.headrooms?.space, r.installedKw) },
    { key: 'hg', header: 'Grid', align: 'right', render: r => head(r.headrooms?.grid, r.installedKw) },
    { key: 'rh', header: 'Racks / halls', align: 'right', render: r => <span className="num">{n0(r.racks)} / {r.halls}</span> },
    { key: 'bind', header: 'Binding', render: r => <Chip tone={BIND_TONE[r.bindingConstraint]} dot>{r.bindingConstraint}</Chip> },
    { key: 'months', header: 'Months', align: 'right', render: r => <span className="num">{r.monthsFromNow}{r.crossesWarningMonth !== undefined && <Muted size="xs"> · warns at {r.crossesWarningMonth}</Muted>}</span> },
  ], []);
  const ladderRows = useMemo(() => ev.ladder.map(r => ({ ...r, id: r.phase.id })), [ev.ladder]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel icon={Gauge} title={<span>Binding constraint: {ev.bindingConstraint}</span>} actions={binding ? <Chip tone={BIND_TONE[binding.bindingConstraint]} dot>{binding.phase.name}</Chip> : <Chip tone="success" dot>All phases clear</Chip>}>
        <div className={`note ${ev.bindingConstraint === 'none' ? 'note--good' : ev.bindingConstraint === 'space' ? 'note--warn' : 'note--bad'}`}><div>{BIND_TEXT[ev.bindingConstraint]}</div></div>
        {binding && <div style={{ marginTop: 8 }}><Muted>At {binding.phase.name}: {fmtKw(binding.installedKw)} installed, {fmtKw(binding.committedKw)} committed, {fmtKw(binding.reserveKw)} reserve, {fmtKw(binding.headroomKw)} usable headroom{binding.crossesWarningMonth !== undefined ? `; at ${plan.demand.growthPctPerYear}% growth the warning threshold is crossed about ${binding.crossesWarningMonth} months from now` : ''}.</Muted></div>}
        {ev.ladder[0]?.committedBasis && <div style={{ marginTop: 6 }}><Muted size="xs">Committed load: {ev.ladder[0].committedBasis}.</Muted></div>}
      </Panel>

      {site && (
        <Panel flush icon={Building2} title={`Site today · ${site.dc.name}`} actions={<Chip tone={site.headroomItKw > 0 ? 'success' : 'error'} dot>{fmtKw(site.headroomItKw)} free · binding {site.binding?.label ?? 'none'}</Chip>}
          foot={<Muted size="xs">Live draw {fmtKw(site.itLoadKw)} · holds {fmtKw(site.reservedKw)} · approved plans not yet reserved {fmtKw(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(x => x.plnId).join(', ')})` : ''}</Muted>}>
          <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
            <thead><tr><th>Stage</th><th>Redundancy</th><th className="is-right">Usable</th><th className="is-right">Load</th><th className="is-right">Headroom (IT kW)</th><th>Basis</th></tr></thead>
            <tbody>{site.stages.map(s => <tr key={s.key}><td><span className="vw-card-activity-label">{s.label}</span></td><td>{s.redundancy}</td><td className="is-right num">{fmtKw(s.usableKw)}</td><td className="is-right num">{fmtKw(s.loadKw)}</td><td className="is-right num" style={{ color: s.headroomItKw < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtKw(Math.max(0, s.headroomItKw))}{s.headroomItKw < 0 ? ' short' : ''}</td><td className="is-wrap"><Muted size="xs">{s.basis}</Muted></td></tr>)}</tbody>
          </table></div></div>
        </Panel>
      )}

      <Panel icon={ChartColumn} title="Capacity ladder" actions={<span className="row" style={{ gap: 8 }}><Muted>Reserve policy</Muted><SourcedValue s={ev.params['reservePct']} unit="%" /><Muted>· growth {plan.demand.growthPctPerYear}% a year</Muted></span>}>
        {ev.ladder.length === 0 ? <Muted>No phases defined — add phases in the wizard or accept the phasing proposal.</Muted> : <PhaseLadderChart rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={320} />}
      </Panel>

      <Panel flush icon={Layers} title="Headroom by phase" sub="after committed load and the reserve" count={ev.ladder.length}>
        <DataTable rows={ladderRows} cols={cols} pageSize={200} />
      </Panel>
    </div>
  );
}
