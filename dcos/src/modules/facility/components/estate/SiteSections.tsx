/* The data centre record's estate sections: site details, rooms by type, power plant,
   cooling and monitoring sources. Each reads the one SiteEstate the page loads. */
import { Link, useNavigate } from 'react-router-dom';
import { VwChip } from '../../../../shared/components/ux';
import { Panel } from '../../../../ops/ui/kit';
import type { DataCenter, Hall } from '../../../../mock/data/types';
import type { SiteEstate } from '../../lib/useSiteEstate';
import {
  ROOM_TYPES, roomTypeOf, isWhiteSpace, businessModelLabel, localTimeAt, formatAddress, generatorReadiness, READINESS_TONE,
  daysSince, countBy, countSummary, fmtKw, fmtDate, rackDensity, GENERATOR_TEST_INTERVAL_DAYS,
} from '../../lib/estateView';
import { plantOfSite, collectorCoverage, cduForCrac } from '../../lib/estateRules';
import { Block, KvList, LoadText, Muted, PlainTable, StatusChip } from './kit';
import { RackLinks } from './RoomEquipment';
import { roomContentsSummary } from '../../lib/roomContents';

const notRecorded = <Muted>Not recorded</Muted>;
const hallLink = (est: SiteEstate, hallId?: string) => {
  const h = hallId ? est.hallById.get(hallId) : undefined;
  return h ? <Link to={`/facility/hall/${h.id}`} onClick={(e) => e.stopPropagation()}>{h.name}</Link> : <Muted>—</Muted>;
};

// ── Site details ───────────────────────────────────────────────────────────
export function SiteDetailsCard({ dc, est }: { dc: DataCenter; est: SiteEstate }) {
  const local = localTimeAt(dc.timezone);
  const live = est.clusters.filter((c) => c.status === 'Live').length;
  return (
    <Panel title="Site details">
      <KvList columns={2} items={[
        { label: 'Category', value: dc.category ?? notRecorded },
        { label: 'Business model', value: businessModelLabel(dc.businessModel) ?? notRecorded },
        { label: 'Operator', value: dc.operatorName ?? notRecorded },
        { label: 'Address', value: formatAddress(dc) ?? notRecorded },
        { label: 'Time zone', value: dc.timezone ? <>{dc.timezone}{local && <Muted> · local time {local}</Muted>}</> : notRecorded },
        { label: 'Tier', value: dc.tier },
        { label: 'Design PUE', value: dc.designPue != null ? dc.designPue.toFixed(2) : notRecorded },
        { label: 'Cooling redundancy', value: dc.coolingRedundancy ?? notRecorded },
        { label: 'Commissioned', value: dc.commissionedDate ? fmtDate(dc.commissionedDate) : notRecorded },
        { label: 'GPU clusters', value: est.clusters.length
          ? <>{est.clusters.length} ({live} live) · <Link to="/capacity/compute">compute capacity</Link></>
          : <Muted>None</Muted> },
        dc.extRef && { label: 'Imported from', value: `${dc.extRef.source} · ${dc.extRef.id}` },
      ]} />
    </Panel>
  );
}

// ── Rooms by type ──────────────────────────────────────────────────────────
interface RoomRow { hall: Hall; racks: number; ai: number; liquid: number; itKw: number; clusters: number; contents: string }

export function RoomsSection({ est }: { est: SiteEstate }) {
  const navigate = useNavigate();
  const rows: RoomRow[] = est.halls.map((h) => {
    const rk = est.racks.filter((r) => r.hallId === h.id);
    return {
      hall: h, racks: rk.length, ai: rk.filter((r) => rackDensity(r) === 'ai').length, liquid: rk.filter((r) => r.liquidCooled).length,
      itKw: Math.round(rk.reduce((s, r) => s + r.currentPowerKw, 0)), clusters: est.clusters.filter((c) => c.hallId === h.id).length,
      contents: roomContentsSummary(est, h),
    };
  });
  const groups = ROOM_TYPES.map((t) => ({ type: t, rows: rows.filter((r) => roomTypeOf(r.hall) === t) })).filter((g) => g.rows.length);
  const cooling = (h: Hall) => [h.coolingMethod, h.containment && h.containment !== 'None' ? `${h.containment.toLowerCase()} containment` : h.containment === 'None' ? 'no containment' : undefined].filter(Boolean).join(' · ') || '—';
  const open = (r: RoomRow) => navigate(`/facility/hall/${r.hall.id}`);
  if (!groups.length) return <Panel title="Rooms"><Muted>No rooms are recorded for this data center.</Muted></Panel>;
  return (
    <Panel title="Rooms" sub={<>{countSummary(groups.map((g) => ({ key: g.type, n: g.rows.length })), false)}</>}>
      <div className="vw-flex vw-flex-col vw-gap-lg">
        {groups.map((g) => isWhiteSpace({ roomType: g.type }) ? (
          <Block key={g.type} title={`${g.type}s (${g.rows.length})`} note="Rooms that hold racks">
            <PlainTable rows={g.rows} rowKey={(r) => r.hall.id} empty="No rooms" onRow={open} columns={[
              { title: 'Room', render: (_, r) => <span className="vw-flex vw-flex-col"><span>{r.hall.name}</span><Muted size="xs">{r.hall.status ?? 'Live'}{r.hall.areaSqm ? ` · ${Math.round(r.hall.areaSqm)} m²` : ''}</Muted></span> },
              { title: 'Cooling', render: (_, r) => cooling(r.hall) },
              { title: 'Racks', align: 'right', render: (_, r) => `${r.racks} / ${r.hall.rackCapacity}` },
              { title: 'AI density', align: 'right', render: (_, r) => r.ai || <Muted>0</Muted> },
              { title: 'Liquid-cooled', align: 'right', render: (_, r) => r.liquid || <Muted>0</Muted> },
              { title: 'IT load', render: (_, r) => <LoadText used={r.itKw} max={r.hall.designPowerKw} /> },
              { title: 'GPU clusters', align: 'right', render: (_, r) => r.clusters || <Muted>—</Muted> },
            ]} />
          </Block>
        ) : (
          <Block key={g.type} title={`${g.type}s (${g.rows.length})`} note="What stands in each room">
            <PlainTable rows={g.rows} rowKey={(r) => r.hall.id} empty="No rooms" onRow={open} columns={[
              { title: 'Room', render: (_, r) => r.hall.name },
              { title: 'Cooling', render: (_, r) => cooling(r.hall) },
              { title: 'Contents', render: (_, r) => r.contents === 'Nothing recorded' ? <Muted>{r.contents}</Muted> : r.contents },
            ]} />
          </Block>
        ))}
      </div>
    </Panel>
  );
}

// ── Power plant ────────────────────────────────────────────────────────────
function CoverText({ usable, itKw, units }: { usable: number; itKw: number; units: number }) {
  if (units === 0) return <Muted>None recorded</Muted>;
  const short = itKw - usable;
  return <>{fmtKw(usable)} usable vs {fmtKw(itKw)} IT load {short > 0 ? <VwChip variant="error">short by {fmtKw(short)}</VwChip> : <VwChip variant="success">covers the load</VwChip>}{units === 1 && <> <VwChip variant="warning">single unit, no reserve</VwChip></>}</>;
}

export function PowerPlantSection({ est, dcId }: { est: SiteEstate; dcId: string }) {
  const ps = plantOfSite(dcId, { utilityFeeds: est.feeds, upsUnits: est.ups, generators: est.generators, dcPlants: est.dcPlants });
  const ready = countBy(est.generators, (g) => generatorReadiness(g));
  const active = est.feeds.filter((f) => (f.normalRole ?? 'Active') === 'Active');
  const rect = ps.rectifiers;
  const batt = ps.batteries;
  return (
    <div className="vw-flex vw-flex-col vw-gap-lg">
      <Panel title="Power summary" sub={<>Usable capacity keeps the largest unit, or the redundant generators, in reserve (N+1)</>}>
        <KvList columns={2} items={[
          { label: 'IT load (racks)', value: fmtKw(est.itKw) },
          { label: 'Utility feeds', value: est.feeds.length ? `${active.length} active, ${est.feeds.length - active.length} standby · ${fmtKw(active.reduce((s, f) => s + f.capacityKw, 0))} active capacity` : notRecorded },
          { label: 'UPS (N+1)', value: <CoverText usable={ps.upsUsableKw} itKw={est.itKw} units={ps.ups.length} /> },
          { label: 'Generators (N+1)', value: <CoverText usable={ps.generatorUsableKw} itKw={est.itKw} units={ps.generators.length} /> },
          { label: 'Generator readiness', value: est.generators.length ? <>{countSummary(ready, false)}{ps.lastGeneratorTest && <Muted> · last test {fmtDate(ps.lastGeneratorTest.date)} ({ps.lastGeneratorTest.name})</Muted>}</> : notRecorded },
          { label: 'Battery autonomy', value: ps.batteryAutonomyH ? `${ps.batteryAutonomyH} h${ps.dcPlant ? '' : ' (UPS runtime)'}` : notRecorded },
          { label: 'DC plant', value: ps.dcPlant ? `${rect.length} rectifier${rect.length === 1 ? '' : 's'} (${fmtKw(ps.rectifierUsableKw)} usable of ${fmtKw(ps.rectifierKw)}), ${batt.length} battery bank${batt.length === 1 ? '' : 's'}` : <Muted>None</Muted> },
        ]} />
      </Panel>

      <Panel title={`Utility feeds (${est.feeds.length})`}>
        <PlainTable rows={est.feeds} rowKey={(f) => f.id} empty="No utility feeds recorded" columns={[
          { title: 'Feed', render: (_, f) => <span className="vw-flex vw-flex-col"><span>{f.name}</span><Muted size="xs">{f.provider}</Muted></span> },
          { title: 'Supply', render: (_, f) => <VwChip variant={f.supply === 'DC' ? 'purple' : 'neutral'}>{f.supply ?? 'AC'}</VwChip> },
          { title: 'Rating', render: (_, f) => f.ratingText ?? `${f.voltage} V` },
          { title: 'Capacity', align: 'right', render: (_, f) => fmtKw(f.capacityKw) },
          { title: 'Current', align: 'right', render: (_, f) => (f.currentA != null ? `${f.currentA} A` : '—') },
          { title: 'Role', render: (_, f) => <span className="vw-flex vw-gap-xs"><StatusChip s={f.normalRole ?? 'Active'} /><VwChip>{f.redundancyRole}</VwChip></span> },
          { title: 'Utility account', render: (_, f) => f.utilityAccount ?? <Muted>—</Muted> },
        ]} />
      </Panel>

      <Panel title={`UPS (${est.ups.length})`}>
        <PlainTable rows={est.ups} rowKey={(u) => u.id} empty="No UPS recorded" columns={[
          { title: 'UPS', render: (_, u) => <span className="vw-flex vw-flex-col"><span>{u.name}</span><Muted size="xs">{[u.manufacturer, u.model].filter(Boolean).join(' ') || '—'}</Muted></span> },
          { title: 'Room', render: (_, u) => hallLink(est, u.hallId) },
          { title: 'Serial', render: (_, u) => u.serial ?? <Muted>—</Muted> },
          { title: 'Load', render: (_, u) => <LoadText used={u.loadKw} max={u.capacityKw} /> },
          { title: 'Redundancy', dataIndex: 'redundancy' },
          { title: 'Runtime', align: 'right', render: (_, u) => `${u.runtimeMinutes} min` },
          { title: 'Status', render: (_, u) => <StatusChip s={u.status} /> },
        ]} />
      </Panel>

      <Panel title={`Generators (${est.generators.length})`} sub={<>A test older than {GENERATOR_TEST_INTERVAL_DAYS} days is overdue</>}>
        <PlainTable rows={est.generators} rowKey={(g) => g.id} empty="No generators recorded" columns={[
          { title: 'Generator', render: (_, g) => <span className="vw-flex vw-flex-col"><span>{g.name}</span><Muted size="xs">{g.model ?? '—'}{g.redundancyRole ? ` · ${g.redundancyRole}` : ''}</Muted></span> },
          { title: 'Rating', align: 'right', render: (_, g) => `${g.capacityKva} kVA · ${fmtKw(g.capacityKw)}` },
          { title: 'Fuel tank', align: 'right', render: (_, g) => (g.fuelTankLitres != null ? `${g.fuelTankLitres.toLocaleString()} L` : '—') },
          { title: 'Runtime', align: 'right', render: (_, g) => `${g.fuelHours} h at full load` },
          { title: 'Last test', render: (_, g) => { const d = daysSince(g.lastTestDate); return g.lastTestDate ? <span className="vw-flex vw-flex-col"><span>{fmtDate(g.lastTestDate)}</span><Muted size="xs">{d} days ago</Muted></span> : <Muted>Never</Muted>; } },
          { title: 'Result', render: (_, g) => <StatusChip s={g.lastTestResult} /> },
          { title: 'Readiness', render: (_, g) => { const r = generatorReadiness(g); return <VwChip variant={READINESS_TONE[r]}>{r}</VwChip>; } },
        ]} />
      </Panel>

      <Panel title={`DC plant (${est.dcPlants.length})`} sub={<>−48 V rectifiers and battery banks</>}>
        <PlainTable rows={est.dcPlants} rowKey={(p) => p.id} empty="No DC plant at this site" columns={[
          { title: 'Equipment', render: (_, p) => <span className="vw-flex vw-flex-col"><span>{p.name}</span><Muted size="xs">{p.kind}</Muted></span> },
          { title: 'Room', render: (_, p) => hallLink(est, p.hallId) },
          { title: 'Voltage', align: 'right', render: (_, p) => (p.volts != null ? `${p.volts} V` : '—') },
          { title: 'Rating', render: (_, p) => p.ratedOutput ?? (p.capacityKw != null ? fmtKw(p.capacityKw) : '—') },
          { title: 'Capacity', align: 'right', render: (_, p) => (p.ah != null ? `${p.ah} Ah` : p.capacityKw != null ? fmtKw(p.capacityKw) : '—') },
          { title: 'Autonomy', align: 'right', render: (_, p) => (p.autonomyH != null ? `${p.autonomyH} h` : '—') },
          { title: 'Last test', render: (_, p) => fmtDate(p.lastTestDate) },
          { title: 'Status', render: (_, p) => <StatusChip s={p.status} /> },
        ]} />
      </Panel>
    </div>
  );
}

// ── Cooling ────────────────────────────────────────────────────────────────
export function CoolingSection({ est, redundancy }: { est: SiteEstate; redundancy?: string }) {
  const zoneName = new Map(est.zones.map((z) => [z.id, z.name]));
  const hallsOfZone = (zoneId: string) => est.halls.filter((h) => h.coolingZoneId === zoneId);
  const liquidCap = est.cdus.reduce((s, c) => s + c.cdu.capacityKw, 0);
  const liquidLoad = est.cdus.reduce((s, c) => s + c.drawKw, 0);
  // The cooling plant lists facility CDUs as units of type CDU; those are shown once, with their detail, under CDUs.
  const cdusRaw = est.cdus.map((c) => c.cdu);
  const airUnits = est.cracs.filter((c) => !cduForCrac(cdusRaw, c));
  const liquidRacks = est.racks.filter((r) => r.liquidCooled);
  const noCdu = liquidRacks.filter((r) => !r.cduId || !est.cduById.has(r.cduId));
  const sensorRows = est.halls
    .map((h) => ({ id: h.id, hall: h, sensors: est.sensors.filter((s) => s.hallId === h.id) }))
    .filter((r) => r.sensors.length);
  const unplaced = est.sensors.filter((s) => !s.hallId).length;
  return (
    <div className="vw-flex vw-flex-col vw-gap-lg">
      <Panel title="Cooling summary">
        <KvList columns={2} items={[
          { label: 'Cooling redundancy', value: redundancy ?? notRecorded },
          { label: 'Cooling units', value: `${airUnits.length} unit${airUnits.length === 1 ? '' : 's'} · ${fmtKw(airUnits.reduce((s, c) => s + c.capacityKw, 0))}` },
          { label: 'Liquid cooling (CDUs)', value: est.cdus.length ? <LoadText used={liquidLoad} max={liquidCap} /> : <Muted>None</Muted> },
          { label: 'Liquid-cooled racks', value: liquidRacks.length ? <>{liquidRacks.length}{noCdu.length > 0 && <> <VwChip variant="warning">{noCdu.length} without a CDU</VwChip></>}</> : <Muted>None</Muted> },
          { label: 'Sensors', value: est.sensors.length ? countSummary(countBy(est.sensors, (s) => s.kind)) : notRecorded },
          { label: 'Cooling zones', value: est.zones.length ? `${est.zones.length} · ${fmtKw(est.zones.reduce((s, z) => s + z.coolingCapacityKw, 0))} design` : notRecorded },
        ]} />
      </Panel>

      <Panel title={`Cooling units (${airUnits.length})`} sub={<>By the rooms their cooling zone serves; CDUs are listed below</>}>
        <PlainTable rows={[...airUnits].sort((a, b) => a.coolingZoneId.localeCompare(b.coolingZoneId) || a.name.localeCompare(b.name))} rowKey={(c) => c.id} empty="No cooling units recorded" columns={[
          { title: 'Unit', dataIndex: 'name' },
          { title: 'Type', render: (_, c) => <VwChip variant={c.type === 'CDU' ? 'cyan' : 'neutral'}>{c.type}</VwChip> },
          { title: 'Rooms', render: (_, c) => { const hs = hallsOfZone(c.coolingZoneId); return hs.length ? <span className="vw-flex vw-gap-xs" style={{ flexWrap: 'wrap' }}>{hs.map((h) => <Link key={h.id} to={`/facility/hall/${h.id}`}>{h.name}</Link>)}</span> : <Muted>—</Muted>; } },
          { title: 'Zone', render: (_, c) => zoneName.get(c.coolingZoneId) ?? '—' },
          { title: 'Capacity', align: 'right', render: (_, c) => fmtKw(c.capacityKw) },
          { title: 'Supply / return', render: (_, c) => `${c.supplyTempC} / ${c.returnTempC} °C` },
          { title: 'Status', render: (_, c) => <StatusChip s={c.status} /> },
        ]} />
      </Panel>

      <Panel title={`Coolant distribution units (${est.cdus.length})`} sub={<>Liquid load is the draw of the racks each CDU serves</>}>
        <PlainTable rows={est.cdus} rowKey={(v) => v.cdu.id} empty="No CDUs at this site" columns={[
          { title: 'CDU', render: (_, v) => <span className="vw-flex vw-flex-col"><span>{v.cdu.name}</span><Muted size="xs">{[v.cdu.vendor, v.cdu.model].filter(Boolean).join(' ') || '—'}</Muted></span> },
          { title: 'Room', render: (_, v) => hallLink(est, v.cdu.hallId) },
          { title: 'Liquid load', render: (_, v) => <LoadText used={v.drawKw} max={v.cdu.capacityKw} /> },
          { title: 'Racks served', render: (_, v) => <RackLinks racks={v.racks} /> },
          { title: 'Flow', align: 'right', render: (_, v) => `${v.cdu.nominalFlowLpm} L/min` },
          { title: 'Supply', align: 'right', render: (_, v) => (v.cdu.designSupplyC != null ? `${v.cdu.designSupplyC} °C` : '—') },
          { title: 'Status', render: (_, v) => <StatusChip s={v.cdu.status} /> },
        ]} />
      </Panel>

      <Panel title={`Sensors by room (${est.sensors.length})`} sub={unplaced ? <>{unplaced} not placed in a room</> : undefined}>
        <PlainTable rows={sensorRows} rowKey={(r) => r.id} empty="No sensors recorded" columns={[
          { title: 'Room', render: (_, r) => hallLink(est, r.hall.id) },
          { title: 'Room type', render: (_, r) => roomTypeOf(r.hall) },
          { title: 'Sensors', align: 'right', render: (_, r) => r.sensors.length },
          { title: 'Kinds', render: (_, r) => countSummary(countBy(r.sensors, (s) => s.kind)) },
          { title: 'Mapped to BMS', align: 'right', render: (_, r) => `${r.sensors.filter((s) => s.bmsPoint).length} of ${r.sensors.length}` },
        ]} />
      </Panel>
    </div>
  );
}

// ── Monitoring sources ─────────────────────────────────────────────────────
export function MonitoringSection({ est, dcId }: { est: SiteEstate; dcId: string }) {
  const cov = collectorCoverage(dcId, est.devices, est.collectors);
  const byCollector = new Map(cov.byCollector.map((x) => [x.collector.id, x]));
  const sensorsBy = new Map<string, number>();
  for (const s of est.sensors) if (s.collectorId) sensorsBy.set(s.collectorId, (sensorsBy.get(s.collectorId) ?? 0) + 1);
  return (
    <div className="vw-flex vw-flex-col vw-gap-lg">
      <Panel title="Monitoring coverage" sub={<>Collectors are integrated through Databyte; DCOS keeps the reference</>}>
        <KvList columns={2} items={[
          { label: 'Collectors', value: est.collectors.length ? countSummary(countBy(est.collectors, (c) => c.status ?? 'Healthy'), false) : notRecorded },
          { label: 'Coverage', value: cov.devices ? <>{cov.monitored} of {cov.devices} devices monitored ({cov.pct}%)</> : <Muted>No devices to monitor</Muted> },
          { label: 'Not monitored', value: cov.unmonitored ? <VwChip variant="warning">{cov.unmonitored}</VwChip> : <Muted>0</Muted> },
          { label: 'Left out of scope', value: <Muted>{cov.tenant} tenant-owned, {cov.notInstalled} not installed</Muted> },
          { label: 'Sensors on a collector', value: `${est.sensors.filter((s) => s.collectorId).length} of ${est.sensors.length}` },
        ]} />
      </Panel>
      <Panel title="Coverage by domain">
        <PlainTable rows={cov.byDomain.map((d) => ({ ...d, id: d.domain }))} rowKey={(d) => d.id} empty="No devices or collectors recorded" columns={[
          { title: 'Domain', dataIndex: 'domain' },
          { title: 'Collectors', render: (_, d) => d.collectors.length ? d.collectors.map((c) => c.name).join(', ') : <VwChip variant="warning">None</VwChip> },
          { title: 'Devices', align: 'right', dataIndex: 'devices' },
          { title: 'Monitored', align: 'right', render: (_, d) => `${d.monitored} of ${d.devices}${d.devices ? ` · ${Math.round((d.monitored / d.devices) * 100)}%` : ''}` },
        ]} />
      </Panel>
      <Panel title={`Collectors (${est.collectors.length})`}>
        <PlainTable rows={est.collectors} rowKey={(c) => c.id} empty="No monitoring sources recorded" columns={[
          { title: 'Collector', render: (_, c) => <span className="vw-flex vw-flex-col"><span>{c.name}</span><Muted size="xs">{c.colId}</Muted></span> },
          { title: 'Protocol', dataIndex: 'protocol' },
          { title: 'Domain', dataIndex: 'domain' },
          { title: 'Host', render: (_, c) => c.hostIp ? <code style={{ fontSize: 'var(--vw-font-label-xs)' }}>{c.hostIp}</code> : <Muted>—</Muted> },
          { title: 'Covers', render: (_, c) => c.covers ?? <Muted>—</Muted> },
          { title: 'Devices', align: 'right', render: (_, c) => { const x = byCollector.get(c.id); return x ? `${x.monitored} of ${x.devices}` : (est.polledBy.get(c.id) ?? 0); } },
          { title: 'Sensors', align: 'right', render: (_, c) => sensorsBy.get(c.id) ?? 0 },
          { title: 'Status', render: (_, c) => <StatusChip s={c.status ?? 'Healthy'} /> },
        ]} />
      </Panel>
    </div>
  );
}
