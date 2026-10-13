import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { AirVent, Snowflake, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { LiquidCoolingCard } from '../components/EstateCapacityCards';
import type { CoolingZone, CRAC } from '../../../mock/data/types';

export default function CoolingCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const zones = (useEntityList('coolingZones', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];
  const cracs = (useEntityList('cracUnits', { pageSize: 5000 }).data?.data ?? []) as unknown as CRAC[];
  const model = useCapacity();
  const cap = model.cooling.max, load = model.cooling.used;
  const loadPct = cap ? Math.round((load / cap) * 100) : 0;
  const zonePct = (z: CoolingZone) => (z.coolingCapacityKw ? Math.round((z.currentLoadKw / z.coolingCapacityKw) * 100) : 0);

  const zoneCols: Col<CoolingZone>[] = [
    { key: 'zone', header: 'Zone', sort: (z) => z.name, render: (z) => <span className="strong">{z.name}</span> },
    { key: 'cap', header: 'Capacity', align: 'right', sort: (z) => z.coolingCapacityKw, render: (z) => <span className="num">{z.coolingCapacityKw} kW</span> },
    { key: 'load', header: 'Load', sort: zonePct, render: (z) => <Meter pct={zonePct(z)} width={64} /> },
    { key: 'set', header: 'Setpoint', align: 'right', render: (z) => <span className="num">{z.setpointC}°C</span> },
  ];
  const cracCols: Col<CRAC>[] = [
    { key: 'unit', header: 'Unit', sort: (c) => c.name, render: (c) => <span className="strong mono">{c.name}</span> },
    { key: 'type', header: 'Type', sort: (c) => c.type, render: (c) => <Chip tone={c.type === 'CDU' ? 'cyan' : 'neutral'} size="xs">{c.type}</Chip> },
    { key: 'sup', header: 'Supply', align: 'right', render: (c) => <span className="num">{c.supplyTempC}°C</span> },
    { key: 'ret', header: 'Return', align: 'right', render: (c) => <span className="num">{c.returnTempC}°C</span> },
    { key: 'status', header: 'Status', sort: (c) => c.status, render: (c) => <Chip tone="neutral" size="xs" dot>{c.status}</Chip> },
  ];

  return (
    <OpsPage title={embedded ? 'Cooling' : 'Cooling capacity'} description="Cooling load, available headroom and plant status."
      actions={!embedded && <Btn variant="filled" icon={Zap} onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Upgrade the chillers to add ${Math.round(load * 0.2)} kW of cooling capacity`)}`)}>Raise capacity plan</Btn>}>
      <StatGrid cols={4}>
        <StatTile label="Cooling capacity" value={<>{Math.round(cap).toLocaleString()}<small> kW</small></>} sub={`${zones.length} cooling zones`} />
        <StatTile label="Current load" value={<>{Math.round(load).toLocaleString()}<small> kW</small></>} sub={`${loadPct}% of capacity`}>
          <SoftMeter pct={loadPct} tone={loadPct >= 85 ? 'error' : loadPct >= 60 ? 'warning' : 'cyan'} />
        </StatTile>
        <StatTile label="Headroom" value={<>{Math.round(cap - load).toLocaleString()}<small> kW</small></>} sub="before the safe maximum" subTone={cap - load < 0 ? 'bad' : undefined} />
        <StatTile label="CRAC/CRAH units" value={cracs.length} sub="cooling plant units" />
      </StatGrid>

      <div className="grid g-2">
        <Panel title="Cooling zones" count={zones.length} icon={Snowflake} flush>
          <DataTable rows={zones} cols={zoneCols} maxHeight={320} pageSize={500} compact />
        </Panel>
        <Panel title="CRAC / CRAH / CDU units" count={cracs.length} icon={AirVent} flush>
          <DataTable rows={cracs} cols={cracCols} maxHeight={320} pageSize={500} compact />
        </Panel>
      </div>

      <LiquidCoolingCard filters={dcF} />
    </OpsPage>
  );
}
