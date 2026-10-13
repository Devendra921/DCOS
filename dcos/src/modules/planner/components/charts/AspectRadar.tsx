/**
 * Aspect radar — completeness per aspect (answered parameters ÷ required) on a spider chart:
 * blue fill, dashed 100% ring, a dot at each vertex; summary-depth aspects drawn lighter.
 */
import { useVwPalette } from '../../../site360/lib/siteModel';
import { ASPECT_LABEL } from '../../lib/engine';
import type { AspectRadarProps } from './types';
import { useMeasuredWidth, useTip } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, Legend } from './ChartBits';

/** "Space and layout" → "Space"; "Compute, storage and GPU" → "Compute". */
const shortLabel = (aspect: keyof typeof ASPECT_LABEL) => {
  const full = ASPECT_LABEL[aspect];
  const head = full.split(/,| and /)[0].trim();
  return head.length > 14 ? `${head.slice(0, 13)}…` : head;
};

export function AspectRadar({ aspects, size = 280 }: AspectRadarProps) {
  const p = useVwPalette();
  const [wrapRef] = useMeasuredWidth(size);
  const { tip, show, hide } = useTip(wrapRef);

  if (!aspects.length) return <ChartEmpty title="No aspects required" hint="The plan template lists which aspects a plan of this scope must cover." height={size * 0.6} />;

  const n = aspects.length;
  const pad = Math.max(58, size * 0.19);
  const cx = size / 2, cy = size / 2, R = size / 2 - pad;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  const rings = [25, 50, 75];
  const ringPath = (pct: number) => aspects.map((_, i) => pt(i, (R * pct) / 100)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
  const scorePath = aspects.map((a, i) => pt(i, (R * Math.max(0, Math.min(100, a.pct))) / 100)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
  const avg = Math.round(aspects.reduce((s, a) => s + a.pct, 0) / n);
  const tipFor = (a: AspectRadarProps['aspects'][number]) => {
    const fails = a.findings.filter((f) => f.status === 'fail').length, warns = a.findings.filter((f) => f.status === 'warn').length;
    return <TipRows title={ASPECT_LABEL[a.aspect]} rows={[['Complete', `${a.pct}% (${a.answered} of ${a.total})`], ['Depth', a.depth], ['Rules', a.findings.length ? `${a.findings.length} · ${fails} fail · ${warns} warn` : 'none']]} />;
  };

  if (n < 3) {
    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: size }}>
        {aspects.map((a) => (
          <div key={a.aspect} onMouseMove={(e) => show(e, tipFor(a))} onMouseLeave={hide} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: 'var(--vw-color-slate-700)' }}>{ASPECT_LABEL[a.aspect]}</span>
            <span style={{ fontWeight: 600, color: 'var(--vw-color-slate-900)' }}>{a.pct}%</span>
            <div style={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, background: 'var(--vw-color-slate-100)' }}><div style={{ width: `${a.pct}%`, height: '100%', borderRadius: 3, background: a.depth === 'summary' ? p.blueLight : p.blue, transition: 'width 300ms ease' }} /></div>
          </div>
        ))}
        <ChartTip tip={tip} width={size} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={hide}>
        {rings.map((r) => <path key={r} d={ringPath(r)} fill="none" stroke={p.grid} strokeWidth={1} />)}
        <path d={ringPath(100)} fill="none" stroke={p.slateLight} strokeWidth={1} strokeDasharray="4 3" />
        {aspects.map((a, i) => { const [x, y] = pt(i, R); return <line key={a.aspect} x1={cx} y1={cy} x2={x} y2={y} stroke={p.grid} strokeWidth={1} />; })}
        {rings.map((r) => <text key={r} x={cx + 3} y={cy - (R * r) / 100 - 2} fontSize={8} fill={p.slateLight}>{r}%</text>)}
        <path d={scorePath} fill={p.blue} fillOpacity={0.18} stroke={p.blue} strokeWidth={2} strokeLinejoin="round" style={{ transition: 'd 400ms ease' }} />
        {aspects.map((a, i) => {
          const [x, y] = pt(i, (R * Math.max(0, Math.min(100, a.pct))) / 100);
          const [lx, ly] = pt(i, R + 14);
          const cos = Math.cos(angle(i));
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          const summary = a.depth === 'summary';
          const fails = a.findings.some((f) => f.status === 'fail');
          return (
            <g key={a.aspect} onMouseMove={(e) => show(e, tipFor(a))}>
              <circle cx={x} cy={y} r={summary ? 3.5 : 4.5} fill={summary ? p.surface : p.blue} stroke={summary ? p.blueLight : p.surface} strokeWidth={summary ? 1.5 : 2} />
              {fails && <circle cx={x} cy={y} r={7.5} fill="none" stroke={p.red} strokeWidth={1.5} />}
              <text x={lx} y={ly} dy="0.35em" textAnchor={anchor} fontSize={10} fill={summary ? p.slate : p.ink} fontWeight={summary ? 400 : 500}>{shortLabel(a.aspect)}</text>
              <text x={lx} y={ly + 11} dy="0.35em" textAnchor={anchor} fontSize={9} fill={a.pct >= 100 ? p.emerald : a.pct < 50 ? p.amber : p.slate} fontWeight={600}>{a.pct}%</text>
              {/* invisible hit area around the vertex */}
              <circle cx={x} cy={y} r={12} fill="transparent" />
            </g>
          );
        })}
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={size * 0.06} fontWeight={700} fill={p.ink} opacity={0.9}>{avg}%</text>
      </svg>
      <ChartTip tip={tip} width={size} />
      <Legend items={[{ label: 'Full depth', color: p.blue, kind: 'dot' }, { label: 'Summary depth', color: p.blueLight, kind: 'dot' }, { label: '100% complete', color: p.slateLight, kind: 'dash' }, { label: 'Hard fail in aspect', color: p.red, kind: 'dot' }]} />
    </div>
  );
}
