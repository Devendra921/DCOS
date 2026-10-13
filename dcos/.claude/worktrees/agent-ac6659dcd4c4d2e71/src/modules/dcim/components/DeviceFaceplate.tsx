import { useState } from 'react';
import { Tooltip, Typography, Space, Empty } from 'antd';
import { VwSegmented } from '../../../shared/components/ux';
import type { DeviceComponent } from '../../../mock/data/types';

const { Text } = Typography;

type Face = 'front' | 'rear';
const FRONT_KINDS = ['interface', 'console', 'console-server', 'front-port'];
const REAR_KINDS = ['power-port', 'power-outlet', 'rear-port'];

const KIND_LABEL: Record<string, string> = {
  interface: 'Interfaces', console: 'Console', 'console-server': 'Console server',
  'front-port': 'Front ports', 'rear-port': 'Rear ports', 'power-port': 'Power inputs', 'power-outlet': 'Outlets',
};

/** Accent colour per kind; cabled = filled, free = outline, disabled = muted. */
function accent(kind: string): string {
  if (kind === 'interface') return '#22c55e';
  if (kind === 'console' || kind === 'console-server') return '#38bdf8';
  if (kind === 'power-port' || kind === 'power-outlet') return '#f59e0b';
  return '#a855f7'; // front/rear pass-through
}
const trail = (s: string) => s.match(/(\d+)$/)?.[1] ?? s.slice(-3);

export interface DeviceFaceplateProps {
  components: DeviceComponent[];
  /** returns the cable object (or truthy) if the component is cabled */
  isCabled: (compId: string) => boolean;
  /** "deviceName : portName" of the far end, or undefined when free */
  peerLabel: (compId: string) => string | undefined;
  /** click a port (cabled flag lets the caller choose trace vs connect) */
  onPort?: (c: DeviceComponent, cabled: boolean) => void;
  /** compact mode for the rack drawer */
  compact?: boolean;
}

export function DeviceFaceplate({ components, isCabled, peerLabel, onPort, compact }: DeviceFaceplateProps) {
  const hasRear = components.some((c) => REAR_KINDS.includes(c.kind));
  const hasFront = components.some((c) => FRONT_KINDS.includes(c.kind));
  const [face, setFace] = useState<Face>(hasFront ? 'front' : 'rear');

  const kinds = (face === 'front' ? FRONT_KINDS : REAR_KINDS).filter((k) => components.some((c) => c.kind === k));
  const cw = compact ? 24 : 30;
  const ch = compact ? 16 : 20;

  if (!hasFront && !hasRear) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ports on this device" />;

  const port = (c: DeviceComponent) => {
    const cabled = isCabled(c.id);
    const disabled = c.kind === 'interface' && c.enabled === false;
    const a = accent(c.kind);
    const peer = peerLabel(c.id);
    const bg = disabled ? '#374151' : cabled ? a : 'transparent';
    const border = disabled ? '#4b5563' : cabled ? a : '#64748b';
    const fg = cabled && !disabled ? '#0b1220' : '#cbd5e1';
    return (
      <Tooltip key={c.id} title={<span>{c.name}{c.ifaceType ? ` · ${c.ifaceType}` : ''}<br />{peer ? `→ ${peer}` : 'free'}{disabled ? ' · disabled' : ''}{c.moduleId ? ' · module' : ''}</span>}>
        <div
          onClick={onPort ? () => onPort(c, cabled) : undefined}
          style={{
            width: cw, height: ch, borderRadius: 3, background: bg, border: `1.5px solid ${border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onPort ? 'pointer' : 'default',
            boxShadow: c.moduleId ? 'inset 0 2px 0 #a855f7' : undefined, position: 'relative',
          }}
        >
          <span style={{ fontSize: 8, fontWeight: 600, color: fg, lineHeight: 1 }}>{trail(c.name)}</span>
        </div>
      </Tooltip>
    );
  };

  return (
    <div>
      {hasFront && hasRear && (
        <div style={{ marginBottom: "var(--vw-space-sm)" }}>
          <VwSegmented size="small" value={face} onChange={(v) => setFace(v as Face)}
            options={[{ label: 'Front', value: 'front' }, { label: 'Rear', value: 'rear' }]} />
        </div>
      )}
      {/* the faceplate / chassis */}
      <div style={{ background: "linear-gradient(180deg,var(--vw-color-gray-800),var(--vw-color-gray-900))", border: '1px solid #0b1220', borderRadius: "var(--vw-radius-sm)", padding: compact ? 10 : 14 }}>
        {kinds.length === 0 ? (
          <Text className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>No {face} ports.</Text>
        ) : kinds.map((k) => {
          const rows = components.filter((c) => c.kind === k);
          return (
            <div key={k} style={{ marginBottom: 10 }}>
              <Text className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{KIND_LABEL[k] ?? k} · {rows.length}</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-xxs)", marginTop: 5 }}>
                {rows.map(port)}
              </div>
            </div>
          );
        })}
      </div>
      {/* legend */}
      <Space size={14} style={{ marginTop: "var(--vw-space-sm)", flexWrap: 'wrap' }}>
        <Lg c="#22c55e" t="cabled" filled /><Lg c="#64748b" t="free" /><Lg c="#374151" t="disabled" filled />
        <Lg c="#38bdf8" t="console" /><Lg c="#f59e0b" t="power" /><Lg c="#a855f7" t="pass-through / module" />
      </Space>
    </div>
  );
}

function Lg({ c, t, filled }: { c: string; t: string; filled?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}>
      <span style={{ width: 11, height: 11, borderRadius: 2, background: filled ? c : 'transparent', border: `1.5px solid ${c}`, display: 'inline-block' }} />{t}
    </span>
  );
}

export default DeviceFaceplate;
