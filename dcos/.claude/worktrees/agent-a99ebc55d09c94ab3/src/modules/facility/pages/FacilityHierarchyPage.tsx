import { Building as BuildingIcon, BuildingOffice, Buildings, Globe, HardDrives, Rows, SquaresFour, Warehouse } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tree, Empty } from 'antd';
import type { TreeDataNode } from 'antd';
import { ApartmentOutlined, ThunderboltOutlined, HomeOutlined, DashboardOutlined, CloudServerOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard } from '../../../shared/components/ux';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type { Enterprise, Region, Campus, DataCenter, Building, Floor, Hall, Row as RowT, Rack } from '../../../mock/data/types';

export default function FacilityHierarchyPage() {
  const navigate = useNavigate();
  const ent = (useEntityList('enterprises', { pageSize: 50 }).data?.data ?? []) as unknown as Enterprise[];
  const reg = (useEntityList('regions', { pageSize: 50 }).data?.data ?? []) as unknown as Region[];
  const cmp = (useEntityList('campuses', { pageSize: 50 }).data?.data ?? []) as unknown as Campus[];
  const dcs = (useEntityList('dataCenters', { pageSize: 50 }).data?.data ?? []) as unknown as DataCenter[];
  const blds = (useEntityList('buildings', { pageSize: 2000 }).data?.data ?? []) as unknown as Building[];
  const flrs = (useEntityList('floors', { pageSize: 2000 }).data?.data ?? []) as unknown as Floor[];
  const halls = (useEntityList('halls', { pageSize: 2000 }).data?.data ?? []) as unknown as Hall[];
  const rows = (useEntityList('rows', { pageSize: 5000 }).data?.data ?? []) as unknown as RowT[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];

  const kpis = useMemo(() => {
    const total = racks.length;
    return {
      dcs: dcs.length, total,
      avgPower: total ? Math.round(racks.reduce((s, r) => s + r.powerUtilizationPct, 0) / total) : 0,
      headroomKw: Math.round(racks.reduce((s, r) => s + (r.maxPowerKw - r.currentPowerKw), 0)),
      gpu: racks.filter((r) => r.purpose === 'GPU').length,
    };
  }, [racks, dcs]);

  const treeData: TreeDataNode[] = useMemo(() => {
    const node = (key: string, title: React.ReactNode): TreeDataNode => ({ key, title });
    return ent.map((e) => ({
      ...node('ent:' + e.id, <><Buildings weight="regular" size="1em" aria-hidden="true" /> {e.name}</>),
      children: reg.filter((r) => r.enterpriseId === e.id).map((r) => ({
        ...node('reg:' + r.id, <><Globe weight="regular" size="1em" aria-hidden="true" /> {r.name}</>),
        children: cmp.filter((c) => c.regionId === r.id).map((c) => ({
          ...node('cmp:' + c.id, <><Buildings weight="regular" size="1em" aria-hidden="true" /> {c.name}</>),
          children: dcs.filter((d) => d.campusId === c.id).map((d) => ({
            ...node('dc:' + d.id, d.dcTypeKey ? <><BuildingOffice weight="regular" size="1em" aria-hidden="true" /> {d.name} ({dcTypeName(d.dcTypeKey)} · {d.tier})</> : <><BuildingOffice weight="regular" size="1em" aria-hidden="true" /> {d.name} ({d.tier})</>),
            children: blds.filter((b) => b.dataCenterId === d.id).map((b) => ({
              ...node('bld:' + b.id, <><BuildingIcon weight="regular" size="1em" aria-hidden="true" /> {b.name}</>),
              children: flrs.filter((f) => f.buildingId === b.id).map((f) => ({
                ...node('flr:' + f.id, <><SquaresFour weight="regular" size="1em" aria-hidden="true" /> {f.name}</>),
                children: halls.filter((hh) => hh.floorId === f.id).map((hh) => ({
                  ...node('hall:' + hh.id, <><Warehouse weight="regular" size="1em" aria-hidden="true" /> {hh.name} — {hh.utilizationPct}%</>),
                  children: rows.filter((rw) => rw.hallId === hh.id).map((rw) => ({
                    ...node('row:' + rw.id, <><Rows weight="regular" size="1em" aria-hidden="true" /> {rw.name}</>),
                    children: racks.filter((rk) => rk.rowId === rw.id).map((rk) => ({
                      key: 'rack:' + rk.id, title: <><HardDrives weight="regular" size="1em" aria-hidden="true" /> {rk.name} · {rk.powerUtilizationPct}% · {rk.purpose}</>, isLeaf: true,
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    }));
  }, [ent, reg, cmp, dcs, blds, flrs, halls, rows, racks]);

  // Expand to DC level by default
  const expanded = useMemo(() => [
    ...ent.map((e) => 'ent:' + e.id), ...reg.map((r) => 'reg:' + r.id),
    ...cmp.map((c) => 'cmp:' + c.id), ...dcs.map((d) => 'dc:' + d.id),
  ], [ent, reg, cmp, dcs]);

  const onSelect = (keys: React.Key[]) => {
    const k = String(keys[0] ?? '');
    if (k.startsWith('rack:')) navigate(`/facility/racks/${k.slice(5)}`);
    else if (k.startsWith('hall:')) navigate(`/facility/hall/${k.slice(5)}`);
    else if (k.startsWith('dc:')) navigate(`/facility/dc/${k.slice(3)}`);
  };

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Data Center Hierarchy</div>
      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Data Centers" value={kpis.dcs} icon={<HomeOutlined />} iconTone="info" />
        <KPICard title="Racks" value={kpis.total} icon={<ApartmentOutlined />} iconTone="cyan" />
        <KPICard title="Avg Power Utilization" value={kpis.avgPower} suffix="%" color={kpis.avgPower >= 85 ? 'var(--vw-color-red-600)' : undefined} icon={<DashboardOutlined />} iconTone="warning" />
        <KPICard title="Power Headroom" value={kpis.headroomKw} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="GPU Racks" value={kpis.gpu} icon={<CloudServerOutlined />} iconTone="purple" />
      </div>
      <VwCard title="Enterprise → Region → Campus → DC → Building → Floor → Hall → Row → Rack" size="small">
        {treeData.length === 0 ? <Empty /> : (
          <Tree treeData={treeData} defaultExpandedKeys={expanded} selectable onSelect={onSelect} showLine
            style={{ maxHeight: 560, overflow: 'auto' }} />
        )}
      </VwCard>
    </div>
  );
}
