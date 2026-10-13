import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tree } from 'antd';
import type { TreeDataNode } from 'antd';
import { Building, Building2, ChevronsDownUp, ChevronsUpDown, Globe, Layers, Network, Rows3, Server, Warehouse, Landmark } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Empty, Panel, SearchBox } from '../../../ops/ui/kit';
import { Facts, RankList, SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import './facility-hierarchy.css';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type { Enterprise, Region, Campus, DataCenter, Building as BuildingT, Floor, Hall, Row as RowT, Rack } from '../../../mock/data/types';

export default function FacilityHierarchyPage() {
  const navigate = useNavigate();
  const ent = (useEntityList('enterprises', { pageSize: 50 }).data?.data ?? []) as unknown as Enterprise[];
  const reg = (useEntityList('regions', { pageSize: 50 }).data?.data ?? []) as unknown as Region[];
  const cmp = (useEntityList('campuses', { pageSize: 200 }).data?.data ?? []) as unknown as Campus[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const blds = (useEntityList('buildings', { pageSize: 2000 }).data?.data ?? []) as unknown as BuildingT[];
  const flrs = (useEntityList('floors', { pageSize: 2000 }).data?.data ?? []) as unknown as Floor[];
  const halls = (useEntityList('halls', { pageSize: 2000 }).data?.data ?? []) as unknown as Hall[];
  const rows = (useEntityList('rows', { pageSize: 5000 }).data?.data ?? []) as unknown as RowT[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];

  const kpis = useMemo(() => {
    const total = racks.length;
    const purposes = new Map<string, number>();
    racks.forEach((r) => purposes.set(String(r.purpose), (purposes.get(String(r.purpose)) ?? 0) + 1));
    const maxKw = racks.reduce((s, r) => s + r.maxPowerKw, 0);
    return {
      dcs: dcs.length, total,
      avgPower: total ? Math.round(racks.reduce((s, r) => s + r.powerUtilizationPct, 0) / total) : 0,
      headroomKw: Math.round(racks.reduce((s, r) => s + (r.maxPowerKw - r.currentPowerKw), 0)),
      maxKw: Math.round(maxKw),
      hot: racks.filter((r) => r.powerUtilizationPct >= 85).length,
      gpu: racks.filter((r) => r.purpose === 'GPU').length,
      purposes: [...purposes.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [racks, dcs]);

  type Level = 'ent' | 'reg' | 'cmp' | 'dc' | 'bld' | 'flr' | 'hall' | 'row' | 'rack';
  const LEVELS: Record<Level, { label: string; icon: React.ReactNode; bg: string; fg: string }> = {
    ent: { label: 'Enterprise', icon: <Landmark size={14} aria-hidden="true" />, bg: 'var(--vw-color-slate-100)', fg: 'var(--vw-color-slate-700)' },
    reg: { label: 'Region', icon: <Globe size={14} aria-hidden="true" />, bg: 'var(--vw-color-cyan-50)', fg: 'var(--vw-color-cyan-700)' },
    cmp: { label: 'Campus', icon: <Building2 size={14} aria-hidden="true" />, bg: 'var(--vw-color-purple-50)', fg: 'var(--vw-color-purple-700)' },
    dc: { label: 'DC', icon: <Network size={14} aria-hidden="true" />, bg: 'var(--primaryColor50)', fg: 'var(--primaryColor700)' },
    bld: { label: 'Building', icon: <Building size={14} aria-hidden="true" />, bg: 'var(--vw-color-indigo-50, var(--primaryColor50))', fg: 'var(--vw-color-indigo-700, var(--primaryColor700))' },
    flr: { label: 'Floor', icon: <Layers size={14} aria-hidden="true" />, bg: 'var(--vw-color-teal-50, var(--vw-color-emerald-50))', fg: 'var(--vw-color-teal-700, var(--vw-color-emerald-700))' },
    hall: { label: 'Hall', icon: <Warehouse size={14} aria-hidden="true" />, bg: 'var(--vw-color-amber-50)', fg: 'var(--vw-color-amber-700)' },
    row: { label: 'Row', icon: <Rows3 size={14} aria-hidden="true" />, bg: 'var(--vw-color-orange-50)', fg: 'var(--vw-color-orange-700)' },
    rack: { label: 'Rack', icon: <Server size={14} aria-hidden="true" />, bg: 'var(--vw-color-emerald-50)', fg: 'var(--vw-color-emerald-700)' },
  };
  const utilTone = (pct: number) => pct >= 85 ? 'error' : pct >= 70 ? 'warning' : 'success';

  const { treeData, parentOf, textOf } = useMemo(() => {
    const parentOf = new Map<string, string>();
    const textOf = new Map<string, string>();
    const node = (level: Level, id: string, parent: string | null, name: string, meta?: React.ReactNode, isLeaf?: boolean): TreeDataNode => {
      const key = `${level}:${id}`;
      if (parent) parentOf.set(key, parent);
      textOf.set(key, name.toLowerCase());
      const L = LEVELS[level];
      return {
        key, isLeaf,
        title: (
          <span className="fh-node">
            <span className="fh-ico" style={{ background: L.bg, color: L.fg }}>{L.icon}</span>
            <span className="fh-name">{name}</span>
            {meta && <span className="fh-meta">{meta}</span>}
          </span>
        ),
      };
    };
    const chip = (text: React.ReactNode, tone: string = 'neutral') => <span className={`vw-chip vw-chip--${tone} chip-xs`}>{text}</span>;
    const data = ent.map((e) => {
      const ek = 'ent:' + e.id;
      return {
        ...node('ent', e.id, null, e.name),
        children: reg.filter((r) => r.enterpriseId === e.id).map((r) => {
          const rk0 = 'reg:' + r.id;
          return {
            ...node('reg', r.id, ek, r.name),
            children: cmp.filter((c) => c.regionId === r.id).map((c) => {
              const ck = 'cmp:' + c.id;
              return {
                ...node('cmp', c.id, rk0, c.name),
                children: dcs.filter((d) => d.campusId === c.id).map((d) => {
                  const dk = 'dc:' + d.id;
                  return {
                    ...node('dc', d.id, ck, d.name, <>{d.dcTypeKey && chip(dcTypeName(d.dcTypeKey), 'info')}{chip(String(d.tier))}</>),
                    children: blds.filter((b) => b.dataCenterId === d.id).map((b) => {
                      const bk = 'bld:' + b.id;
                      return {
                        ...node('bld', b.id, dk, b.name),
                        children: flrs.filter((f) => f.buildingId === b.id).map((f) => {
                          const fk = 'flr:' + f.id;
                          return {
                            ...node('flr', f.id, bk, f.name),
                            children: halls.filter((hh) => hh.floorId === f.id).map((hh) => {
                              const hk = 'hall:' + hh.id;
                              return {
                                ...node('hall', hh.id, fk, hh.name, chip(`${hh.utilizationPct}% utilised`, utilTone(hh.utilizationPct))),
                                children: rows.filter((rw) => rw.hallId === hh.id).map((rw) => {
                                  const wk = 'row:' + rw.id;
                                  return {
                                    ...node('row', rw.id, hk, rw.name),
                                    children: racks.filter((rk) => rk.rowId === rw.id).map((rk) =>
                                      node('rack', rk.id, wk, rk.name, <>{chip(String(rk.purpose))}{chip(`${rk.powerUtilizationPct}% power`, utilTone(rk.powerUtilizationPct))}</>, true)),
                                  };
                                }),
                              };
                            }),
                          };
                        }),
                      };
                    }),
                  };
                }),
              };
            }),
          };
        }),
      };
    });
    return { treeData: data as TreeDataNode[], parentOf, textOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent, reg, cmp, dcs, blds, flrs, halls, rows, racks]);

  // Expand to DC level by default
  const dcLevel = useMemo(() => [
    ...ent.map((e) => 'ent:' + e.id), ...reg.map((r) => 'reg:' + r.id),
    ...cmp.map((c) => 'cmp:' + c.id), ...dcs.map((d) => 'dc:' + d.id),
  ], [ent, reg, cmp, dcs]);
  const [expanded, setExpanded] = useState<React.Key[] | null>(null);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set([...textOf.entries()].filter(([, t]) => t.includes(q)).map(([k]) => k));
  }, [query, textOf]);
  const searchExpanded = useMemo(() => {
    const out = new Set<string>();
    matches.forEach((k) => { let p = parentOf.get(k); while (p) { out.add(p); p = parentOf.get(p); } });
    return [...out];
  }, [matches, parentOf]);
  const shownExpanded = query.trim() ? searchExpanded : (expanded ?? dcLevel);

  const onSelect = (keys: React.Key[]) => {
    const k = String(keys[0] ?? '');
    if (k.startsWith('rack:')) navigate(`/facility/racks/${k.slice(5)}`);
    else if (k.startsWith('hall:')) navigate(`/facility/hall/${k.slice(5)}`);
    else if (k.startsWith('dc:')) navigate(`/facility/dc/${k.slice(3)}`);
  };

  const powerTone: Tone = kpis.avgPower >= 85 ? 'error' : kpis.avgPower >= 70 ? 'warning' : 'info';

  return (
    <OpsPage title="Hierarchy" description="Enterprise → region → campus → data center → building → floor → hall → row → rack">
      <StatGrid cols={5}>
        <StatTile label="Data centers" value={kpis.dcs} sub={`${cmp.length} campuses · ${reg.length} regions`}>
          <Facts items={[{ n: blds.length, label: 'buildings' }, { n: halls.length, label: 'halls' }]} />
        </StatTile>
        <StatTile label="Racks" value={kpis.total} sub={`${rows.length} rows`}>
          <RankList items={kpis.purposes.slice(0, 3).map(([p, n]) => ({ key: p, label: p, n, tone: 'info' as Tone }))} />
        </StatTile>
        <StatTile label="Avg power utilisation" value={<>{kpis.avgPower}<small>%</small></>} sub={kpis.hot ? `${kpis.hot} racks at ≥85%` : 'no racks at ≥85%'} subTone={kpis.avgPower >= 85 ? 'bad' : kpis.hot ? 'warn' : undefined}>
          <SoftMeter pct={kpis.avgPower} tone={powerTone} />
        </StatTile>
        <StatTile label="Power headroom" value={<>{kpis.headroomKw.toLocaleString()}<small> kW</small></>} sub={`of ${kpis.maxKw.toLocaleString()} kW rack capacity`}>
          <SoftMeter pct={kpis.maxKw ? (kpis.headroomKw / kpis.maxKw) * 100 : 0} tone="success" />
        </StatTile>
        <StatTile label="GPU racks" value={kpis.gpu} sub={kpis.total ? `${Math.round((kpis.gpu / kpis.total) * 100)}% of all racks` : 'no racks yet'}>
          <SoftMeter pct={kpis.total ? (kpis.gpu / kpis.total) * 100 : 0} tone="purple" />
        </StatTile>
      </StatGrid>

      <Panel title="Facility hierarchy" icon={Network} count={textOf.size}
        sub={query.trim() ? `${matches.size} match${matches.size === 1 ? '' : 'es'} for “${query.trim()}”` : 'Click a data center, hall or rack to open it'}
        actions={<>
          <SearchBox value={query} onChange={setQuery} placeholder="Find a campus, DC, hall, rack…" width={260} />
          <Btn variant="gray" onClick={() => { setQuery(''); setExpanded(dcLevel); }}>DC level</Btn>
          <Btn variant="gray" icon={ChevronsUpDown} onClick={() => { setQuery(''); setExpanded([...textOf.keys()]); }}>Expand all</Btn>
          <Btn variant="gray" icon={ChevronsDownUp} onClick={() => { setQuery(''); setExpanded([]); }}>Collapse</Btn>
        </>}>
        <div className="fh-path" aria-label="Hierarchy levels">
          {(Object.keys(LEVELS) as Level[]).map((k, i) => (
            <span key={k} className="fh-path-step">
              {i > 0 && <span className="fh-arrow">→</span>}
              <span className="fh-path-chip" style={{ background: LEVELS[k].bg, color: LEVELS[k].fg }}>{LEVELS[k].icon}{LEVELS[k].label}</span>
            </span>
          ))}
        </div>
        {treeData.length === 0 ? <Empty icon={Network} title="No facilities yet">Add an enterprise, region and data center to see the hierarchy.</Empty> : (
          <Tree className="fh-tree" treeData={treeData} expandedKeys={shownExpanded} onExpand={(k) => { if (!query.trim()) setExpanded(k); }}
            selectable onSelect={onSelect} blockNode
            titleRender={(n) => <span className={matches.has(String(n.key)) ? 'fh-hit' : undefined}>{n.title as React.ReactNode}</span>}
            style={{ maxHeight: 600, overflow: 'auto' }} />
        )}
      </Panel>
    </OpsPage>
  );
}
