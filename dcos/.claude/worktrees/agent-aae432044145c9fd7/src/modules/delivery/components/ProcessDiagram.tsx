import { useMemo } from 'react';
import type { ProjectActivity } from '../../../mock/data/types';

const STATUS_FILL: Record<string, string> = { Done: 'var(--vw-color-green-600)', Active: '#2563eb', Pending: '#ffffff', Skipped: '#f1f5f9' };
const STATUS_STROKE: Record<string, string> = { Done: '#15803d', Active: '#1d4ed8', Pending: '#cbd5e1', Skipped: '#cbd5e1' };
const STATUS_TEXT: Record<string, string> = { Done: '#ffffff', Active: '#ffffff', Pending: '#475569', Skipped: 'var(--vw-color-slate-400)' };

const W = { start: 56, end: 64, task: 140, gateway: 96 } as const;
const GAP = 30;
const H = 150;
const CY = 64;

/** Lightweight BPMN-style process diagram. Renders the project's activities
 *  left-to-right (start event → tasks → decision gateways → end event), coloured
 *  by status, with the current activity highlighted. Click a node to select it. */
export default function ProcessDiagram({ activities, selectedId, onSelect }: {
  activities: ProjectActivity[];
  selectedId?: string;
  onSelect?: (a: ProjectActivity) => void;
}) {
  const ordered = useMemo(() => [...activities].sort((a, b) => a.order - b.order), [activities]);
  const laid = useMemo(() => {
    let x = 20;
    return ordered.map((a) => {
      const w = W[a.nodeType as keyof typeof W] ?? W.task;
      const node = { a, x, w, cx: x + w / 2 };
      x += w + GAP;
      return node;
    });
  }, [ordered]);
  const totalW = laid.length ? laid[laid.length - 1].x + laid[laid.length - 1].w + 20 : 200;

  const wrap = (s: string, max = 18) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

  return (
    <div style={{ overflowX: 'auto', paddingBottom: "var(--vw-space-sm)" }}>
      <svg viewBox={`0 0 ${totalW} ${H}`} width={Math.max(totalW, 640)} height={H} style={{ display: 'block' }}>
        <defs>
          <marker id="pa-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--vw-color-slate-400)" />
          </marker>
        </defs>
        {/* connectors */}
        {laid.slice(0, -1).map((n, i) => {
          const next = laid[i + 1];
          const x1 = n.x + n.w, x2 = next.x;
          return <line key={`e${i}`} x1={x1} y1={CY} x2={x2 - 2} y2={CY} stroke="var(--vw-color-slate-400)" strokeWidth={1.5} markerEnd="url(#pa-arrow)" />;
        })}
        {/* nodes */}
        {laid.map(({ a, x, w, cx }) => {
          const fill = STATUS_FILL[a.status], stroke = STATUS_STROKE[a.status], tc = STATUS_TEXT[a.status];
          const sel = a.id === selectedId;
          const strokeW = a.status === 'Active' ? 3 : sel ? 2.5 : 1.5;
          const click = onSelect ? () => onSelect(a) : undefined;
          const common = { onClick: click, style: { cursor: click ? 'pointer' : 'default' } as React.CSSProperties };
          if (a.nodeType === 'start' || a.nodeType === 'end') {
            const r = w / 2;
            return (
              <g key={a.id} {...common}>
                <circle cx={cx} cy={CY} r={r} fill={a.nodeType === 'end' ? (a.status === 'Done' ? 'var(--vw-color-green-600)' : '#fff') : '#fff'} stroke={a.nodeType === 'end' ? '#15803d' : '#64748b'} strokeWidth={a.nodeType === 'end' ? 3 : 2} />
                <text x={cx} y={CY + 4} textAnchor="middle" fontSize={9} fill={a.nodeType === 'end' && a.status === 'Done' ? '#fff' : '#475569'}>{a.nodeType === 'start' ? 'Start' : 'Live'}</text>
                {a.nodeType === 'end' && <text x={cx} y={CY + r + 14} textAnchor="middle" fontSize={10} fill="#64748b">Handover</text>}
              </g>
            );
          }
          if (a.nodeType === 'gateway') {
            const r = 26;
            return (
              <g key={a.id} {...common}>
                <polygon points={`${cx},${CY - r} ${cx + r},${CY} ${cx},${CY + r} ${cx - r},${CY}`} fill={a.status === 'Done' ? '#fefce8' : '#fff'} stroke={a.status === 'Done' ? '#ca8a04' : '#cbd5e1'} strokeWidth={strokeW} />
                <text x={cx} y={CY + 4} textAnchor="middle" fontSize={12} fill="#ca8a04">◇</text>
                <text x={cx} y={CY + r + 14} textAnchor="middle" fontSize={9.5} fill="#64748b">{wrap(a.name, 16)}</text>
              </g>
            );
          }
          // task
          return (
            <g key={a.id} {...common}>
              <rect x={x} y={CY - 26} width={w} height={52} rx={8} fill={fill} stroke={stroke} strokeWidth={strokeW} />
              <text x={cx} y={CY - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={tc}>{wrap(a.name)}</text>
              <text x={cx} y={CY + 12} textAnchor="middle" fontSize={9} fill={tc} opacity={0.85}>{a.status}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
