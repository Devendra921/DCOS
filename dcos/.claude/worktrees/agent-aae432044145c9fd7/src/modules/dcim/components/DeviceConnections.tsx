import { useMemo } from 'react';
import { Empty, Space, Typography } from 'antd';
import type { Cable, DeviceComponent } from '../../../mock/data/types';

const { Text } = Typography;

const CABLE_COLOR: Record<string, string> = {
  Cat6: '#0ea5e9', Cat6a: '#0284c7', 'MMF-OM4': '#a855f7', 'SMF-OS2': '#7c3aed',
  DAC: '#64748b', 'Power-C13': '#f59e0b', 'Power-C19': 'var(--vw-color-amber-600)',
};
const colorOf = (t: string) => CABLE_COLOR[t] ?? 'var(--vw-color-slate-400)';

export interface DeviceConnectionsProps {
  deviceId: string;
  deviceName: string;
  components: DeviceComponent[];           // this device's components
  cables: Cable[];                         // all cables
  deviceNameById: (id: string) => string;
  compById: (id: string) => DeviceComponent | undefined;
  onOpenDevice: (id: string) => void;
  onTrace?: (localComp: DeviceComponent) => void;
}

interface Link { cable: Cable; localComp?: DeviceComponent; peerComp?: DeviceComponent; peerDeviceId: string; }

export function DeviceConnections({ deviceId, deviceName, components, cables, deviceNameById, compById, onOpenDevice, onTrace }: DeviceConnectionsProps) {
  const links = useMemo<Link[]>(() => {
    return cables
      .filter((c) => c.aDeviceId === deviceId || c.bDeviceId === deviceId)
      .map((c) => {
        const localIsA = c.aDeviceId === deviceId;
        const localId = localIsA ? c.aComponentId : c.bComponentId;
        const peerId = localIsA ? c.bComponentId : c.aComponentId;
        const peerDeviceId = localIsA ? c.bDeviceId : c.aDeviceId;
        return { cable: c, localComp: compById(localId), peerComp: compById(peerId), peerDeviceId };
      });
  }, [cables, deviceId, compById]);

  // group links by peer device
  const peers = useMemo(() => {
    const m = new Map<string, Link[]>();
    for (const l of links) { if (!m.has(l.peerDeviceId)) m.set(l.peerDeviceId, []); m.get(l.peerDeviceId)!.push(l); }
    return Array.from(m.entries());
  }, [links]);

  const portKinds = ['interface', 'console', 'console-server', 'power-port', 'power-outlet', 'front-port', 'rear-port'];
  const totalPorts = components.filter((c) => portKinds.includes(c.kind)).length;
  const cabledPorts = new Set(links.map((l) => l.localComp?.id).filter(Boolean));
  const freeCount = totalPorts - cabledPorts.size;

  if (links.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No cables on this device · ${totalPorts} ports, all free`} />;
  }

  const W = 660, H = Math.max(340, 120 + peers.length * 56);
  const cx = 150, cy = H / 2;            // this device sits left-of-center
  const peerX = W - 170;
  const nodeW = 150, nodeH = 38;
  const peerY = (i: number) => (peers.length === 1 ? cy : 50 + (i * (H - 100)) / Math.max(1, peers.length - 1));

  return (
    <div>
      <svg width={W} height={H} style={{ maxWidth: '100%', background: '#fafbfc', border: '1px solid #eef2f7', borderRadius: "var(--vw-radius-sm)" }}>
        {/* edges first (under nodes) */}
        {peers.map(([pid, ls], i) => {
          const y2 = peerY(i);
          return ls.map((l, j) => {
            const off = (j - (ls.length - 1) / 2) * 12;
            const x1 = cx + nodeW / 2, y1 = cy + off;
            const x2 = peerX - nodeW / 2, yy = y2 + off;
            const midX = (x1 + x2) / 2;
            const col = colorOf(l.cable.cableType);
            const path = `M${x1},${y1} C${midX},${y1} ${midX},${yy} ${x2},${yy}`;
            return (
              <g key={l.cable.id} style={{ cursor: onTrace ? 'pointer' : 'default' }} onClick={() => l.localComp && onTrace?.(l.localComp)}>
                <path d={path} fill="none" stroke={col} strokeWidth={2} opacity={0.85} />
                <title>{`${l.localComp?.name ?? '?'} ↔ ${l.peerComp?.name ?? '?'} · ${l.cable.cableType}${l.cable.lengthM ? ` · ${l.cable.lengthM}m` : ''} — click to trace`}</title>
                <text x={x1 + 8} y={y1 - 3} fontSize="8" fill="#475569">{l.localComp?.name}</text>
                <text x={x2 - 8} y={yy - 3} fontSize="8" fill="#475569" textAnchor="end">{l.peerComp?.name}</text>
                <text x={midX} y={(y1 + yy) / 2 - 4} fontSize="8" fill={col} textAnchor="middle">{l.cable.cableType}</text>
              </g>
            );
          });
        })}

        {/* this device (center-left) */}
        <g>
          <rect x={cx - nodeW / 2} y={cy - nodeH / 2} width={nodeW} height={nodeH} rx={6} fill="#0f172a" stroke="#0b1220" />
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{deviceName}</text>
          <text x={cx} y={cy + 11} textAnchor="middle" fontSize="8" fill="var(--vw-color-slate-400)">{cabledPorts.size} cabled · {freeCount} free</text>
        </g>

        {/* peer devices */}
        {peers.map(([pid, ls], i) => {
          const y = peerY(i);
          return (
            <g key={pid} style={{ cursor: 'pointer' }} onClick={() => onOpenDevice(pid)}>
              <rect x={peerX - nodeW / 2} y={y - nodeH / 2} width={nodeW} height={nodeH} rx={6} fill="#fff" stroke="#cbd5e1" />
              <text x={peerX} y={y - 1} textAnchor="middle" fontSize="10" fontWeight="600" fill="#1e293b">{deviceNameById(pid)}</text>
              <text x={peerX} y={y + 11} textAnchor="middle" fontSize="8" fill="var(--vw-color-slate-400)">{ls.length} link{ls.length > 1 ? 's' : ''}</text>
            </g>
          );
        })}
      </svg>

      <Space size={14} style={{ marginTop: "var(--vw-space-sm)", flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{links.length} cables · {peers.length} neighbours · click a neighbour to open, a link to trace.</Text>
      </Space>
      <div style={{ marginTop: 6 }}>
        <Space size={12} wrap>
          {Array.from(new Set(links.map((l) => l.cable.cableType))).map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: colorOf(t), display: 'inline-block' }} />{t}
            </span>
          ))}
        </Space>
      </div>
    </div>
  );
}

export default DeviceConnections;
