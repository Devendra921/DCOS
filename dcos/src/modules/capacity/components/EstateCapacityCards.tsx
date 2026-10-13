/* Capacity cards fed by the estate model: generator readiness and DC plant (power),
   liquid cooling through CDUs (cooling), and AI against standard density (space). */
import { Link } from 'react-router-dom';
import type { FilterCriteria } from '../../../mock/db/store';
import { VwChip } from '../../../shared/components/ux';
import { Panel } from '../../../ops/ui/kit';
import { useSiteEstate } from '../../facility/lib/useSiteEstate';
import {
  countBy, countSummary, daysSince, fmtDate, fmtKw, generatorReadiness, GENERATOR_TEST_INTERVAL_DAYS, READINESS_TONE, rackDensity, DENSITY_LABEL, pctOf,
} from '../../facility/lib/estateView';
import { KvList, LoadText, Muted, PlainTable, StatusChip } from '../../facility/components/estate/kit';
import { RackLinks } from '../../facility/components/estate/RoomEquipment';

const roomLink = (h?: { id: string; name: string }) => (h ? <Link to={`/facility/hall/${h.id}`}>{h.name}</Link> : <Muted>—</Muted>);

/** Standby generation and the DC plant: readiness, overdue tests and battery autonomy. */
export function PlantReadinessCard({ filters }: { filters: FilterCriteria[] }) {
  const est = useSiteEstate({ filters, withDevices: false });
  const attention = est.generators.filter((g) => generatorReadiness(g) !== 'Ready')
    .sort((a, b) => (daysSince(b.lastTestDate) ?? 9999) - (daysSince(a.lastTestDate) ?? 9999));
  const overdue = est.generators.filter((g) => { const r = generatorReadiness(g); return r === 'Test overdue' || r === 'Never tested'; }).length;
  const batt = est.dcPlants.filter((p) => p.kind === 'Battery bank');
  const rect = est.dcPlants.filter((p) => p.kind === 'Rectifier');
  const minAutonomy = batt.filter((p) => p.autonomyH != null).reduce((m, p) => Math.min(m, p.autonomyH!), Infinity);
  return (
    <Panel title="Standby generation and DC plant" actions={<Link to="/facility/power-dist">Site plant register</Link>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <KvList columns={2} items={[
          { label: 'Generators', value: est.generators.length ? `${est.generators.length} · ${fmtKw(est.generators.reduce((s, g) => s + g.capacityKw, 0))}` : <Muted>None recorded</Muted> },
          { label: 'Readiness', value: est.generators.length ? countSummary(countBy(est.generators, (g) => generatorReadiness(g)), false) : '—' },
          { label: `Tests overdue (> ${GENERATOR_TEST_INTERVAL_DAYS} days)`, value: overdue ? <VwChip variant="warning">{overdue}</VwChip> : <Muted>0</Muted> },
          { label: 'Rectifiers', value: rect.length ? `${rect.length} · ${fmtKw(rect.reduce((s, p) => s + (p.capacityKw ?? 0), 0))}` : <Muted>None</Muted> },
          { label: 'Battery banks', value: batt.length ? `${batt.length}${Number.isFinite(minAutonomy) ? ` · shortest autonomy ${minAutonomy} h` : ''}` : <Muted>None</Muted> },
        ]} />
        {attention.length > 0 && (
          <PlainTable rows={attention} rowKey={(g) => g.id} pageSize={6} empty="Every generator is ready" columns={[
            { title: 'Generator', render: (_, g) => <Link to={`/facility/dc/${g.dataCenterId}?tab=power`}>{g.name}</Link> },
            { title: 'Last test', render: (_, g) => g.lastTestDate ? `${fmtDate(g.lastTestDate)} · ${daysSince(g.lastTestDate)} days ago` : <Muted>Never</Muted> },
            { title: 'Result', render: (_, g) => <StatusChip s={g.lastTestResult} /> },
            { title: 'Readiness', render: (_, g) => { const r = generatorReadiness(g); return <VwChip variant={READINESS_TONE[r]}>{r}</VwChip>; } },
          ]} />
        )}
      </div>
    </Panel>
  );
}

/** Liquid cooling: CDU capacity against the draw of the racks each one serves. */
export function LiquidCoolingCard({ filters }: { filters: FilterCriteria[] }) {
  const est = useSiteEstate({ filters, withDevices: false });
  const cap = est.cdus.reduce((s, c) => s + c.cdu.capacityKw, 0);
  const load = est.cdus.reduce((s, c) => s + c.drawKw, 0);
  const liquid = est.racks.filter((r) => r.liquidCooled);
  const orphan = liquid.filter((r) => !r.cduId || !est.cduById.has(r.cduId)).length;
  const rows = [...est.cdus].sort((a, b) => b.loadPct - a.loadPct);
  return (
    <Panel title="Liquid cooling (CDUs)" sub="Liquid load is the draw of the racks each CDU serves">
      <div className="vw-flex vw-flex-col vw-gap-md">
        <KvList columns={2} items={[
          { label: 'CDU capacity', value: est.cdus.length ? `${fmtKw(cap)} across ${est.cdus.length} CDU${est.cdus.length === 1 ? '' : 's'}` : <Muted>No CDUs in scope</Muted> },
          { label: 'Liquid load', value: est.cdus.length ? <LoadText used={load} max={cap} /> : '—' },
          { label: 'Liquid headroom', value: est.cdus.length ? fmtKw(Math.max(0, cap - load)) : '—' },
          { label: 'Liquid-cooled racks', value: liquid.length ? <>{liquid.length}{orphan > 0 && <> <VwChip variant="warning">{orphan} without a CDU</VwChip></>}</> : <Muted>None</Muted> },
        ]} />
        {rows.length > 0 && (
          <PlainTable rows={rows} rowKey={(v) => v.cdu.id} pageSize={6} empty="No CDUs" columns={[
            { title: 'CDU', render: (_, v) => v.cdu.name },
            { title: 'Room', render: (_, v) => roomLink(v.cdu.hallId ? est.hallById.get(v.cdu.hallId) : undefined) },
            { title: 'Load', render: (_, v) => <LoadText used={v.drawKw} max={v.cdu.capacityKw} /> },
            { title: 'Racks served', render: (_, v) => <RackLinks racks={v.racks} max={3} /> },
            { title: 'Status', render: (_, v) => <StatusChip s={v.cdu.status} /> },
          ]} />
        )}
      </div>
    </Panel>
  );
}

/** Space split by rack density: AI / high-density racks against standard racks. */
export function DensitySplitCard({ filters }: { filters: FilterCriteria[] }) {
  const est = useSiteEstate({ filters, withDevices: false });
  const rows = (['ai', 'standard'] as const).map((k) => {
    const rk = est.racks.filter((r) => rackDensity(r) === k);
    const usedU = rk.reduce((s, r) => s + r.usedU, 0); const totalU = rk.reduce((s, r) => s + r.heightU, 0);
    const budget = rk.reduce((s, r) => s + r.maxPowerKw, 0); const draw = rk.reduce((s, r) => s + r.currentPowerKw, 0);
    return { id: k, label: DENSITY_LABEL[k], racks: rk.length, usedU, totalU, budget, draw, perRack: rk.length ? budget / rk.length : 0, liquid: rk.filter((r) => r.liquidCooled).length };
  });
  return (
    <Panel title="Racks by density" sub="AI density from the rack record, else GPU racks">
      <PlainTable rows={rows} rowKey={(r) => r.id} empty="No racks in scope" columns={[
        { title: 'Density', render: (_, r) => <VwChip variant={r.id === 'ai' ? 'purple' : 'neutral'}>{r.label}</VwChip> },
        { title: 'Racks', align: 'right', dataIndex: 'racks' },
        { title: 'Space used', render: (_, r) => `${r.usedU.toLocaleString()} / ${r.totalU.toLocaleString()} U · ${pctOf(r.usedU, r.totalU)}%` },
        { title: 'Power budget', align: 'right', render: (_, r) => `${fmtKw(r.budget)} · ${fmtKw(r.perRack)} per rack` },
        { title: 'Draw', render: (_, r) => <LoadText used={Math.round(r.draw)} max={Math.round(r.budget)} /> },
        { title: 'Liquid-cooled', align: 'right', render: (_, r) => r.liquid || <Muted>0</Muted> },
      ]} />
    </Panel>
  );
}
