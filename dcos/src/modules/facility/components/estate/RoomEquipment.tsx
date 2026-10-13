/* What stands in a room — UPS, DC plant, cooling units, CDUs, sensors and racks — as tables (room page). */
import { Link } from 'react-router-dom';
import { VwChip } from '../../../../shared/components/ux';
import type { Hall } from '../../../../mock/data/types';
import type { SiteEstate } from '../../lib/useSiteEstate';
import { countBy, countSummary, fmtDate, fmtKw } from '../../lib/estateView';
import { roomContents } from '../../lib/roomContents';
import { Block, LoadText, Muted, PlainTable, StatusChip } from './kit';

/** Tables of the equipment in one room; sections with nothing in them are left out. */
export function RoomEquipment({ est, hall, showRacks = false }: { est: SiteEstate; hall: Hall; showRacks?: boolean }) {
  const c = roomContents(est, hall);
  const nothing = !c.ups.length && !c.plant.length && !c.cdus.length && !c.cracs.length && !c.sensors.length && !(showRacks && c.racks.length);
  if (nothing) return <Muted>Nothing is recorded in this room yet. Plant, cooling units and sensors appear here once they name this room.</Muted>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-lg">
      {c.ups.length > 0 && (
        <Block title={`UPS (${c.ups.length})`}>
          <PlainTable rows={c.ups} rowKey={(u) => u.id} empty="No UPS" columns={[
            { title: 'UPS', render: (_, u) => <span className="vw-flex vw-flex-col"><span>{u.name}</span><Muted size="xs">{[u.manufacturer, u.model].filter(Boolean).join(' ') || '—'}</Muted></span> },
            { title: 'Serial', render: (_, u) => u.serial ?? <Muted>—</Muted> },
            { title: 'Load', render: (_, u) => <LoadText used={u.loadKw} max={u.capacityKw} /> },
            { title: 'Redundancy', dataIndex: 'redundancy' },
            { title: 'Runtime', align: 'right', render: (_, u) => `${u.runtimeMinutes} min` },
            { title: 'Status', render: (_, u) => <StatusChip s={u.status} /> },
          ]} />
        </Block>
      )}
      {c.plant.length > 0 && (
        <Block title={`DC plant (${c.plant.length})`} note="−48 V rectifiers and battery banks">
          <PlainTable rows={c.plant} rowKey={(p) => p.id} empty="No DC plant" columns={[
            { title: 'Equipment', render: (_, p) => <span className="vw-flex vw-flex-col"><span>{p.name}</span><Muted size="xs">{p.kind}</Muted></span> },
            { title: 'Voltage', align: 'right', render: (_, p) => (p.volts != null ? `${p.volts} V` : '—') },
            { title: 'Rating', render: (_, p) => p.ratedOutput ?? (p.capacityKw != null ? fmtKw(p.capacityKw) : p.ah != null ? `${p.ah} Ah` : '—') },
            { title: 'Autonomy', align: 'right', render: (_, p) => (p.autonomyH != null ? `${p.autonomyH} h` : '—') },
            { title: 'Last test', render: (_, p) => fmtDate(p.lastTestDate) },
            { title: 'Status', render: (_, p) => <StatusChip s={p.status} /> },
          ]} />
        </Block>
      )}
      {c.cracs.length > 0 && (
        <Block title={`Cooling units (${c.cracs.length})`} note="Units of the room's cooling zone">
          <PlainTable rows={c.cracs} rowKey={(u) => u.id} empty="No cooling units" columns={[
            { title: 'Unit', dataIndex: 'name' },
            { title: 'Type', dataIndex: 'type' },
            { title: 'Capacity', align: 'right', render: (_, u) => fmtKw(u.capacityKw) },
            { title: 'Supply / return', render: (_, u) => `${u.supplyTempC} / ${u.returnTempC} °C` },
            { title: 'Status', render: (_, u) => <StatusChip s={u.status} /> },
          ]} />
        </Block>
      )}
      {c.cdus.length > 0 && (
        <Block title={`Coolant distribution units (${c.cdus.length})`} note="Liquid load is the draw of the racks each CDU serves">
          <PlainTable rows={c.cdus} rowKey={(v) => v.cdu.id} empty="No CDUs" columns={[
            { title: 'CDU', render: (_, v) => <span className="vw-flex vw-flex-col"><span>{v.cdu.name}</span><Muted size="xs">{[v.cdu.vendor, v.cdu.model].filter(Boolean).join(' ') || '—'}</Muted></span> },
            { title: 'Liquid load', render: (_, v) => <LoadText used={v.drawKw} max={v.cdu.capacityKw} /> },
            { title: 'Racks served', render: (_, v) => <RackLinks racks={v.racks} /> },
            { title: 'Flow', align: 'right', render: (_, v) => `${v.cdu.nominalFlowLpm} L/min` },
            { title: 'Supply', align: 'right', render: (_, v) => (v.cdu.designSupplyC != null ? `${v.cdu.designSupplyC} °C` : '—') },
            { title: 'Status', render: (_, v) => <StatusChip s={v.cdu.status} /> },
          ]} />
        </Block>
      )}
      {c.sensors.length > 0 && (
        <Block title={`Sensors (${c.sensors.length})`} note={countSummary(countBy(c.sensors, (s) => s.kind))}>
          <PlainTable rows={c.sensors} rowKey={(s) => s.id} empty="No sensors" columns={[
            { title: 'Sensor', dataIndex: 'name' },
            { title: 'Kind', dataIndex: 'kind' },
            { title: 'Position', render: (_, s) => s.position ?? (s.rackId ? est.racks.find((r) => r.id === s.rackId)?.name : undefined) ?? '—' },
            { title: 'BMS point', render: (_, s) => s.bmsPoint ? <code style={{ fontSize: 'var(--vw-font-label-xs)' }}>{s.bmsPoint}</code> : <Muted>—</Muted> },
            { title: 'Collector', render: (_, s) => est.collectors.find((x) => x.id === s.collectorId)?.name ?? <Muted>—</Muted> },
          ]} />
        </Block>
      )}
      {showRacks && c.racks.length > 0 && (
        <Block title={`Racks (${c.racks.length})`}>
          <RackLinks racks={c.racks} max={40} />
        </Block>
      )}
    </div>
  );
}

/** A few rack names as links, then "+n more". */
export function RackLinks({ racks, max = 4 }: { racks: Array<{ id: string; name: string }>; max?: number }) {
  if (!racks.length) return <Muted>None</Muted>;
  return (
    <span className="vw-flex vw-gap-xs" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {racks.slice(0, max).map((r) => <Link key={r.id} to={`/facility/racks/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link>)}
      {racks.length > max && <VwChip>+{racks.length - max} more</VwChip>}
    </span>
  );
}
