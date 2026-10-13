import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Select, Switch, Space, Empty } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { HeartOutlined, ApiOutlined, AlertOutlined, DashboardOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ViewSwitcher } from '../../../shared/components/ux/ViewSwitcher';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { healthColor } from '../../nms/lib/health';
import { buildFabric, TIERS, reachColor, type TopoNode, type Tier } from '../lib/topology';
import type { ManagedDevice, Interface, Alarm, DataCenter } from '../../../mock/data/types';

const { Text } = Typography;
type Base = 'Health' | 'Reachability' | 'Performance' | 'Alarms';
const SEV_HEX: Record<string, string> = { Critical: 'var(--vw-color-red-600)', Major: 'var(--vw-color-orange-700)', Minor: 'var(--primaryColor500)', Warning: '#a16207', Info: 'var(--vw-color-gray-500)' };
const heat = (v: number) => (v >= 85 ? 'var(--vw-color-red-600)' : v >= 60 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-green-600)');
const LABEL_Y: Record<Tier, number> = { Core: 46, Spine: 150, 'Leaf/TOR': 254, Access: 358 };

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

  const BASES: { key: Base; label: string; icon: React.ReactNode }[] = [
    { key: 'Health', label: 'Node health', icon: <HeartOutlined /> },
    { key: 'Reachability', label: 'Reachability', icon: <DashboardOutlined /> },
    { key: 'Performance', label: 'Peak utilisation', icon: <ApiOutlined /> },
    { key: 'Alarms', label: 'Alarm load', icon: <AlertOutlined /> },
  ];
  const unreachable = fabric?.nodes.filter((n) => n.reach === 'Unreachable').length ?? 0;

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Network Topology</div>
        </div>
        <Space wrap>
          <ViewSwitcher />
          <Select placeholder="Select data center" value={activeDc ?? undefined} style={{ width: 200 }} onChange={(v) => { setDcId(v); setSel(null); }}
            options={dcs.map((d) => ({ value: d.id, label: d.name }))} />
        </Space>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-lg)", marginTop: 14 }}>
        <VwCard size="small" title="Layers" style={{ width: 230, flexShrink: 0 }} bodyStyle={{ padding: "var(--vw-space-md)" }}>
          <div className="vw-card-title" style={{ marginBottom: 6 }}>Base layer</div>
          {BASES.map((o) => (
            <div key={o.key} onClick={() => setBase(o.key)}
              style={{ padding: '7px 10px', borderRadius: "var(--vw-radius-sm)", cursor: 'pointer', marginBottom: 3, display: 'flex', gap: "var(--vw-space-sm)", alignItems: 'center', fontSize: "var(--vw-font-label-md)", background: base === o.key ? '#eff6ff' : 'transparent', border: `1px solid ${base === o.key ? '#bfdbfe' : 'transparent'}` }}>
              <span className="vw-text-tertiary">{o.icon}</span>{o.label}
            </div>
          ))}
          <div className="vw-card-title" style={{ margin: '14px 0 8px' }}>Overlays</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)" }}>
            <span style={{ fontSize: "var(--vw-font-label-md)" }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: 'var(--vw-color-red-600)', marginRight: 7 }} />Alarm badges</span>
            <Switch size="small" checked={showAlarms} onChange={setShowAlarms} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: "var(--vw-font-label-md)" }}>Links</span><Switch size="small" checked={showLinks} onChange={setShowLinks} />
          </div>
          {fabric && (
            <div style={{ marginTop: 14, fontSize: "var(--vw-font-label-md)", color: '#515151' }}>
              {TIERS.map((t) => <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{t}</span><strong>{fabric.tierCounts[t]}</strong></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid #f4f4f4', marginTop: "var(--vw-space-xxs)" }}><span>Unreachable</span><strong style={{ color: unreachable ? 'var(--vw-color-red-600)' : undefined }}>{unreachable}</strong></div>
            </div>
          )}
        </VwCard>

        <VwCard size="small" style={{ flex: 1 }} bodyStyle={{ padding: "var(--vw-space-sm)" }}>
          {!fabric || fabric.nodes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No managed devices at this site" /> : (
            <div style={{ overflowX: 'auto' }}>
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
          <Space size={16} style={{ marginTop: 6, paddingLeft: "var(--vw-space-sm)" }} wrap>
            {base === 'Reachability' && <><Legend c="var(--vw-color-green-600)" l="Reachable" /><Legend c="var(--vw-color-orange-700)" l="Degraded" /><Legend c="var(--vw-color-red-600)" l="Unreachable" /></>}
            {base === 'Health' && <><Legend c="var(--vw-color-green-600)" l="≥80" /><Legend c="var(--vw-color-orange-700)" l="60–79" /><Legend c="var(--vw-color-red-600)" l="<60" /></>}
            {base === 'Performance' && <><Legend c="var(--vw-color-green-600)" l="<60%" /><Legend c="var(--vw-color-orange-700)" l="60–85%" /><Legend c="var(--vw-color-red-600)" l="≥85%" /></>}
            {base === 'Alarms' && <><Legend c="var(--vw-color-slate-400)" l="none" /><Legend c="var(--vw-color-orange-700)" l="minor" /><Legend c="var(--vw-color-red-600)" l="crit/major" /></>}
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>· {dcName} · click a node for detail</Text>
          </Space>
        </VwCard>

        {selNode && (
          <VwCard size="small" title={selNode.hostname} extra={<Button size="small" type="text" onClick={() => setSel(null)}>✕</Button>} style={{ width: 280, flexShrink: 0 }}>
            <Space size={4} style={{ marginBottom: 10 }}><VwChip>{selNode.role}</VwChip><VwChip color={reachColor(selNode.reach)}>{selNode.reach}</VwChip></Space>
            {[
              ['Health', String(selNode.health), healthColor(selNode.health)],
              ['Peak utilisation', `${selNode.util}%`, heat(selNode.util)],
              ['Active alarms', String(selNode.alarms), selNode.alarms ? SEV_HEX[selNode.alarmMaxSev ?? 'Minor'] : 'var(--vw-color-gray-500)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #f4f4f4', fontSize: "var(--vw-font-label-md)" }}>
                <Text type="secondary">{l}</Text><Text strong style={{ color: c }}>{v}</Text>
              </div>
            ))}
            <Button size="small" type="primary" ghost block style={{ marginTop: "var(--vw-space-md)" }} onClick={() => navigate(`/nms/devices/${selNode.id}`)}>Open device →</Button>
          </VwCard>
        )}
      </div>
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c, marginRight: "var(--vw-space-xxs)" }} />{l}</span>;
}
