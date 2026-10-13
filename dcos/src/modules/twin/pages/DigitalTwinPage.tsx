import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select } from 'antd';
import { Activity, ArrowRight, BellRing, Heart, Network, Radar, X } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, IconBtn, KV, Panel, Seg, Toggle } from '../../../ops/ui/kit';
import { StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { Legend } from '../../../ops/ui/status';
import { healthColor } from '../../nms/lib/health';
import { buildFabric, TIERS, reachColor, type TopoNode, type Tier } from '../lib/topology';
import type { ManagedDevice, Interface, Alarm, DataCenter } from '../../../mock/data/types';

type Base = 'Health' | 'Reachability' | 'Performance' | 'Alarms';
const SEV_HEX: Record<string, string> = { Critical: 'var(--vw-color-red-600)', Major: 'var(--vw-color-orange-700)', Minor: 'var(--primaryColor500)', Warning: '#a16207', Info: 'var(--vw-color-gray-500)' };
const heat = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)');
const LABEL_Y: Record<Tier, number> = { Core: 46, Spine: 150, 'Leaf/TOR': 254, Access: 358 };
const REACH_TONE: Record<string, Tone> = { Reachable: 'success', Degraded: 'warning', Unreachable: 'error' };

export default function DigitalTwinPage() {
  const navigate = useNavigate();
  const managed = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const interfaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];

  const [base, setBase] = useState<Base>('Health');
  const [showAlarms, setShowAlarms] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [dcId, setDcId] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  // Default to the DC with the most managed devices.
  const defaultDc = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of managed) count.set(d.dataCenterId ?? '', (count.get(d.dataCenterId ?? '') ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dcs[0]?.id ?? null;
  }, [managed, dcs]);
  const activeDc = dcId ?? defaultDc;
  const fabric = useMemo(() => activeDc ? buildFabric(activeDc, managed, interfaces, alarms) : null, [activeDc, managed, interfaces, alarms]);
  const selNode = fabric?.nodes.find((n) => n.id === sel) ?? null;
  const dcName = dcs.find((d) => d.id === activeDc)?.name ?? '';

  const baseColor = (n: TopoNode): string => {
    switch (base) {
      case 'Health': return healthColor(n.health);
      case 'Reachability': return reachColor(n.reach);
      case 'Performance': return heat(n.util);
      case 'Alarms': return n.alarms === 0 ? 'var(--vw-color-slate-400)' : (n.alarmMaxSev === 'Critical' || n.alarmMaxSev === 'Major') ? 'var(--vw-color-red-600)' : 'var(--vw-color-orange-700)';
    }
  };

  const BASES: { id: Base; label: string; icon: typeof Heart }[] = [
    { id: 'Health', label: 'Node health', icon: Heart },
    { id: 'Reachability', label: 'Reachability', icon: Radar },
    { id: 'Performance', label: 'Peak utilisation', icon: Activity },
    { id: 'Alarms', label: 'Alarm load', icon: BellRing },
  ];
  const unreachable = fabric?.nodes.filter((n) => n.reach === 'Unreachable').length ?? 0;
  const legend = base === 'Reachability' ? [{ c: 'var(--vw-color-green-600)', l: 'Reachable' }, { c: 'var(--vw-color-orange-700)', l: 'Degraded' }, { c: 'var(--vw-color-red-600)', l: 'Unreachable' }]
    : base === 'Health' ? [{ c: 'var(--vw-color-green-600)', l: '≥80' }, { c: 'var(--vw-color-orange-700)', l: '60–79' }, { c: 'var(--vw-color-red-600)', l: '<60' }]
      : base === 'Performance' ? [{ c: 'var(--vw-color-green-600)', l: '<60%' }, { c: 'var(--vw-color-orange-700)', l: '60–85%' }, { c: 'var(--vw-color-red-600)', l: '≥85%' }]
        : [{ c: 'var(--vw-color-slate-400)', l: 'none' }, { c: 'var(--vw-color-orange-700)', l: 'minor' }, { c: 'var(--vw-color-red-600)', l: 'crit/major' }];

  const graph = (
    <Panel title={dcName ? `${dcName} fabric` : 'Fabric'} sub="Layered network topology · click a node for detail" icon={Network} count={fabric?.nodes.length} flush
      foot={<><Legend items={legend.map((x) => ({ label: x.l, color: x.c }))} /><span>{dcName}</span></>}>
      {!fabric || fabric.nodes.length === 0 ? <Empty icon={Network} title="No managed devices at this site" /> : (
        <div style={{ overflowX: 'auto', padding: 8 }}>
          <svg viewBox={`0 0 ${fabric.width} ${fabric.height}`} width="100%" style={{ minWidth: 680 }}>
            {TIERS.map((t) => <text key={t} x={6} y={LABEL_Y[t] - 18} fontSize="10" fontWeight={600} fill="#a8a8a8">{t.toUpperCase()}</text>)}
            {showLinks && fabric.edges.map((e) => <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.down ? '#fca5a5' : '#e2e8f0'} strokeWidth={e.down ? 1.5 : 1} strokeDasharray={e.down ? '4 3' : undefined} />)}
            {fabric.nodes.map((n) => {
              const c = baseColor(n); const isSel = n.id === sel;
              return (
                <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSel(n.id)}>
                  <title>{n.hostname} · {n.role} · health {n.health} · {n.util}% · {n.alarms} alarms</title>
                  <circle cx={n.x} cy={n.y} r={isSel ? 13 : 11} fill={c} stroke={isSel ? 'var(--primaryColor500)' : '#fff'} strokeWidth={isSel ? 3 : 2} />
                  {showAlarms && n.alarms > 0 && <><circle cx={n.x + 9} cy={n.y - 9} r={6} fill={SEV_HEX[n.alarmMaxSev ?? 'Minor']} stroke="#fff" strokeWidth={1} /><text x={n.x + 9} y={n.y - 6} textAnchor="middle" fontSize="8" fontWeight={700} fill="#fff">{n.alarms > 9 ? '9' : n.alarms}</text></>}
                  <text x={n.x} y={n.y + 22} textAnchor="middle" fontSize="7.5" fill="var(--vw-color-gray-500)">{n.hostname.length > 16 ? n.hostname.slice(0, 15) + '…' : n.hostname}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Panel>
  );

  return (
    <OpsPage title="Network Topology" description="Layered network topology with health, utilisation and alarm overlays."
      actions={<>
        <ViewSwitcher />
        <Select placeholder="Select data center" value={activeDc ?? undefined} style={{ width: 200 }} onChange={(v) => { setDcId(v); setSel(null); }}
          options={dcs.map((d) => ({ value: d.id, label: d.name }))} />
      </>}>

      {fabric && (
        <StatGrid cols={5}>
          {TIERS.map((t) => <StatTile key={t} label={t} value={fabric.tierCounts[t]} sub={`${t === 'Leaf/TOR' ? 'leaf / top-of-rack' : t.toLowerCase()} nodes`} />)}
          <StatTile label="Unreachable" value={unreachable} sub={unreachable ? 'nodes not answering' : 'all nodes reachable'} subTone={unreachable ? 'bad' : undefined} />
        </StatGrid>
      )}

      <section className="card topo-bar">
        <div className="row wrap" style={{ gap: 12 }}>
          <span className="ops-label" style={{ margin: 0 }}>Base layer</span>
          <Seg<Base> value={base} onChange={setBase} options={BASES} />
          <span className="topo-sep" />
          <span className="ops-label" style={{ margin: 0 }}>Overlays</span>
          <label className="row" style={{ gap: 8, fontSize: 13 }}><Toggle on={showAlarms} onChange={setShowAlarms} label="Alarm badges" />Alarm badges</label>
          <label className="row" style={{ gap: 8, fontSize: 13 }}><Toggle on={showLinks} onChange={setShowLinks} label="Links" />Links</label>
        </div>
      </section>

      {selNode ? (
        <div className="grid g-main-side">
          {graph}
          <Panel title={selNode.hostname} sub={selNode.role} actions={<IconBtn icon={X} title="Close" onClick={() => setSel(null)} />}
            foot={<Btn variant="filled" block iconRight={ArrowRight} onClick={() => navigate(`/nms/devices/${selNode.id}`)}>Open device</Btn>}>
            <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
              <Chip tone="neutral">{selNode.role}</Chip>
              <Chip tone={REACH_TONE[selNode.reach] ?? 'neutral'} dot>{selNode.reach}</Chip>
            </div>
            <KV cols={1} items={[
              ['Health', <b className="num" style={{ color: healthColor(selNode.health) }}>{selNode.health}</b>],
              ['Peak utilisation', <b className="num" style={{ color: heat(selNode.util) }}>{selNode.util}%</b>],
              ['Active alarms', <b className="num" style={{ color: selNode.alarms ? SEV_HEX[selNode.alarmMaxSev ?? 'Minor'] : 'var(--vw-color-gray-500)' }}>{selNode.alarms}</b>],
            ]} />
          </Panel>
        </div>
      ) : graph}
    </OpsPage>
  );
}
