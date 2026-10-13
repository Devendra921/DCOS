import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useMemo, useState } from 'react';
import { BatteryCharging, PlugZap, Zap } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useNavigate } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { PlantReadinessCard } from '../components/EstateCapacityCards';
import type { UtilityFeed, UPS, PDU, Rack, DataCenter } from '../../../mock/data/types';
import { capacityThresholds } from '../../../mock/data/dcTypes';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PowerCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const feeds = (useEntityList('utilityFeeds', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as UtilityFeed[];
  const ups = (useEntityList('upsUnits', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as UPS[];
  const pdus = (useEntityList('pdus', { pageSize: 2000 }).data?.data ?? []) as unknown as PDU[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const cap = useCapacity();
  /** Warning band for a rack = its site's facility-type threshold (85% enterprise, 80% colo / telco, 90% hyperscale / GPU). */
  const warnPct = (r: Rack) => capacityThresholds(dcs.find((d) => d.id === r.dataCenterId)?.dcTypeKey).rackPowerWarnPct;
  const utilOf = (id: string) => cap.perRack[id]?.utilPct ?? 0;
  const drawOf = (id: string) => cap.perRack[id]?.usedKw ?? 0;

  const [q, setQ] = useState('');
  const overBudget = useMemo(() => {
    const s = q.trim().toLowerCase();
    return racks.filter((r) => utilOf(r.id) >= warnPct(r) && (!s || `${r.name} ${r.purpose}`.toLowerCase().includes(s)))
      .sort((a, b) => utilOf(b.id) - utilOf(a.id));
  }, [racks, q, cap, dcs]);
  const pduRows = useMemo(() => [...pdus].sort((a, b) => b.loadPct - a.loadPct), [pdus]);
  const overCount = racks.filter((r) => utilOf(r.id) >= warnPct(r)).length;
  const upsAvg = ups.length ? Math.round(sum(ups.map((u) => u.loadPct)) / ups.length) : 0;

  const upsCols: Col<UPS>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => <span className="strong mono">{r.name}</span> },
    { key: 'cap', header: 'Capacity', align: 'right', sort: (r) => r.capacityKw, render: (r) => <span className="num">{r.capacityKw} kW</span> },
    { key: 'load', header: 'Load', sort: (r) => r.loadPct, render: (r) => <Meter pct={r.loadPct} width={64} /> },
    { key: 'red', header: 'Redundancy', render: (r) => <Chip tone="neutral" size="xs">{r.redundancy}</Chip> },
  ];
  const pduCols: Col<PDU>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => <span className="strong mono">{r.name}</span> },
    { key: 'cap', header: 'Capacity', align: 'right', sort: (r) => r.capacityKw, render: (r) => <span className="num">{r.capacityKw} kW</span> },
    { key: 'load', header: 'Load', sort: (r) => r.loadPct, render: (r) => <Meter pct={r.loadPct} width={64} /> },
    { key: 'outlets', header: 'Outlets', align: 'right', render: (r) => <span className="num">{r.outletsUsed}/{r.outletCount}</span> },
  ];
  const rackCols: Col<Rack>[] = [
    { key: 'rack', header: 'Rack', sort: (r) => r.name, render: (r) => <span className="vw-card-activity-label">{r.name}</span> },
    { key: 'purpose', header: 'Purpose', sort: (r) => r.purpose, render: (r) => <Chip tone={r.purpose === 'GPU' ? 'purple' : 'info'}>{r.purpose}</Chip> },
    { key: 'pwr', header: 'Power (live)', sort: (r) => utilOf(r.id), render: (r) => <Meter pct={utilOf(r.id)} width={72} /> },
    { key: 'draw', header: 'Draw', align: 'right', sort: (r) => drawOf(r.id), render: (r) => <span className="num">{r2(drawOf(r.id))}/{r.maxPowerKw} kW</span> },
  ];

  return (
    <OpsPage title={embedded ? 'Power' : 'Power capacity'} description="Utility feeds, UPS load and rack power headroom."
      actions={<Btn variant="filled" icon={Zap} onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Expand power capacity by ${Math.round(cap.power.used * 0.2)} kW with a plant upgrade`)}`)}>Raise capacity plan</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Feed capacity" value={<>{Math.round(sum(feeds.map((f) => f.capacityKw))).toLocaleString()}<small> kW</small></>} sub={`${feeds.length} utility feeds`} />
        <StatTile label="UPS load (avg)" value={<>{upsAvg}<small>%</small></>} sub={`${ups.length} UPS units`}>
          <SoftMeter pct={upsAvg} tone={upsAvg >= 85 ? 'error' : upsAvg >= 60 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="Rack power draw (live)" value={<>{Math.round(cap.power.used).toLocaleString()}<small> kW</small></>} sub={`across ${racks.length.toLocaleString()} racks`} />
        <StatTile label="Racks over type band" value={overCount} sub="85% enterprise · 80% colo/telco · 90% hyperscale/GPU" subTone={overCount ? 'bad' : undefined} />
      </StatGrid>

      <div className="grid g-2">
        <Panel title="UPS units" count={ups.length} icon={BatteryCharging} flush>
          <DataTable rows={ups} cols={upsCols} maxHeight={320} pageSize={500} compact />
        </Panel>
        <Panel title="PDUs" sub="By load" count={pdus.length} icon={PlugZap} flush>
          <DataTable rows={pduRows} cols={pduCols} maxHeight={320} pageSize={2000} compact />
        </Panel>
      </div>

      <PlantReadinessCard filters={dcF} />

      <section className="vw-card-section dcl-table">
        <DataTable rows={overBudget} cols={rackCols} maxHeight={320} pageSize={10000} onRow={(r) => navigate(`/facility/racks/${r.id}`)}
          toolbar={<ListToolbar shown={overBudget.length} total={overCount} noun="racks over power budget (≥85%)" search={{ value: q, onChange: setQ, placeholder: 'Filter racks…' }} />} />
      </section>
    </OpsPage>
  );
}
