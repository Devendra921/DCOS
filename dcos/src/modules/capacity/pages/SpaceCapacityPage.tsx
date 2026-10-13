import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useCapacity } from '../lib/useCapacity';
import { DensitySplitCard } from '../components/EstateCapacityCards';
import { isPlantRoom, rackDensity, roomTypeOf } from '../../facility/lib/estateView';
import type { Hall, Rack } from '../../../mock/data/types';

export default function SpaceCapacityPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  // Plant, UPS and battery rooms hold no racks, so space counts only the rooms that can.
  const allRooms = (useEntityList('halls', { pageSize: 2000, filters: dcF }).data?.data ?? []) as unknown as Hall[];
  const halls = useMemo(() => allRooms.filter((h) => !isPlantRoom(h)), [allRooms]);
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const aiByHall = useMemo(() => { const m = new Map<string, number>(); for (const r of racks) if (rackDensity(r) === 'ai') m.set(r.hallId, (m.get(r.hallId) ?? 0) + 1); return m; }, [racks]);
  const model = useCapacity();
  const uUsed = model.space.used, uMax = model.space.max;
  const uPct = uMax ? Math.round((uUsed / uMax) * 100) : 0;
  const [q, setQ] = useState('');
  const hallRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...halls].filter((h) => !s || h.name.toLowerCase().includes(s)).sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [halls, q]);

  const cols: Col<Hall>[] = [
    { key: 'hall', header: 'Hall', sort: (h) => h.name, render: (h) => <span className="vw-card-activity-label">{h.name}</span> },
    { key: 'grid', header: 'Grid', render: (h) => <span className="num">{h.gridCols}×{h.gridRows}</span> },
    { key: 'type', header: 'Room type', sort: (h) => roomTypeOf(h), render: (h) => roomTypeOf(h) },
    { key: 'racks', header: 'Racks', align: 'right', sort: (h) => h.rackCount, render: (h) => <span className="num">{h.rackCount}/{h.rackCapacity}</span> },
    { key: 'util', header: 'Utilisation', sort: (h) => h.utilizationPct, render: (h) => <Meter pct={h.utilizationPct} width={72} /> },
    { key: 'ai', header: 'AI racks', align: 'right', sort: (h) => aiByHall.get(h.id) ?? 0, render: (h) => <span className="num">{aiByHall.get(h.id) ?? 0}</span> },
  ];

  return (
    <OpsPage title={embedded ? 'Space' : 'Space capacity'} description="Rack occupancy and available units by hall.">
      <StatGrid cols={4}>
        <StatTile label="Racks" value={racks.length.toLocaleString()} sub="in scope" />
        <StatTile label="U utilisation" value={<>{uPct}<small>%</small></>} sub={`${uUsed.toLocaleString()}/${uMax.toLocaleString()} U`}>
          <SoftMeter pct={uPct} tone={uPct >= 85 ? 'error' : uPct >= 60 ? 'warning' : 'info'} />
        </StatTile>
        <StatTile label="Halls" value={halls.length} sub="data halls" />
        <StatTile label="Free U" value={(uMax - uUsed).toLocaleString()} sub="rack units available" />
      </StatGrid>

      <DensitySplitCard filters={dcF} />

      <section className="vw-card-section dcl-table">
        <DataTable rows={hallRows} cols={cols} maxHeight={320} pageSize={1000} defaultSort={{ key: 'util', dir: 'desc' }} onRow={(h) => navigate(`/facility/hall/${h.id}`)}
          toolbar={<ListToolbar shown={hallRows.length} total={halls.length} noun="halls by utilisation" search={{ value: q, onChange: setQ, placeholder: 'Filter halls…' }} />} />
      </section>
    </OpsPage>
  );
}
