export interface Seg { label: string; value: number; color: string }

export const STATE_COLORS: Record<string, string> = {
  Available: 'var(--vw-color-green-600)', Reserved: '#2563eb', Committed: '#f59e0b', Consumed: '#7c3aed',
};

/** Stacked capacity-state bar (Available → Reserved → Committed → Consumed). */
export function StateBar({ segments, height = 16, unit = '' }: { segments: Seg[]; height?: number; unit?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 6, overflow: 'hidden', background: "var(--vw-color-slate-100)", border: '1px solid #eef2f7' }}>
        {segments.map((s) => s.value > 0 && (
          <div key={s.label} title={`${s.label}: ${s.value}${unit}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: "var(--vw-space-md)", marginTop: 6, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <span key={s.label} style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: s.color, marginRight: "var(--vw-space-xxs)" }} />
            {s.label} {Math.round(s.value)}{unit}
          </span>
        ))}
      </div>
    </div>
  );
}
export default StateBar;
