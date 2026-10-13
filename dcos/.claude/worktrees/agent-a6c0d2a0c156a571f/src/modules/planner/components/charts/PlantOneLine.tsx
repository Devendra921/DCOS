/**
 * Plant one-line — utility feeds → transformers → switchgear → UPS → PDUs → IT load, with the
 * A and B paths drawn separately for 2N designs, a spare unit for N+1, generators behind the
 * switchgear, and the cooling chain (chillers / CRAH or CDUs) in its own lane.
 */
import { useVwPalette } from '../../../site360/lib/siteModel';
import { fmtKw, type PlantItem } from '../../lib/engine';
import type { PlantOneLineProps } from './types';
import { useMeasuredWidth, useTip, fmtInt } from './chartKit';
import { ChartTip, TipRows, ChartEmpty, Legend } from './ChartBits';

interface Box { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; color: string; dashed?: boolean; tip: [string, string][] }
const BW = 120, BH = 46;

export function PlantOneLine({ sizing, redundancy, height = 320 }: PlantOneLineProps) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth();
  const { tip, show, hide } = useTip(wrapRef);

  if (!sizing.plant.length || sizing.itKw <= 0) return <ChartEmpty title="No plant in scope" hint="Plant sizing needs a facility load; network-only and migration scopes do not carry one." height={height} />;

  const red = redundancy.toUpperCase().replace(/\s/g, '');
  const dual = red.startsWith('2N');
  const spare = red === 'N+1';
  const byKind = (k: PlantItem['kind']) => sizing.plant.filter((x) => x.kind === k);
  const feeds = byKind('feed'), tx = byKind('transformer'), ups = byKind('ups'), gens = byKind('generator'), pdus = byKind('pdu'), cooling = [...byKind('cooling'), ...byKind('cdu')];
  const sum = (xs: PlantItem[]) => xs.reduce((a, x) => a + x.capacityKw * x.count, 0);
  const cnt = (xs: PlantItem[]) => xs.reduce((a, x) => a + x.count, 0);
  const half = (n: number) => Math.max(1, Math.ceil(n / 2));
  const chilled = ['chilled-water', 'air-crah', 'air-economiser'].includes(sizing.cooling.type);
  const cdu = sizing.cooling.type === 'liquid-to-chip' || sizing.cooling.type === 'immersion';

  // Layout in a 900-wide design space, scaled to the measured width.
  const W = 900, lanes = dual ? [78, 178] : [128];
  const coolY = 300, genY = dual ? 258 : 214;
  const H = coolY + BH + 16;
  const colX = [10, 170, 330, 490, 650];
  const itX = 790, itY = (lanes[0] + lanes[lanes.length - 1]) / 2 + BH / 2 - 30;
  const pathColor = (i: number) => (i === 1 ? p.violet : p.blue);
  const sideLabel = (i: number) => (dual ? ` · path ${i ? 'B' : 'A'}` : '');

  const boxes: Box[] = [];
  const links: { d: string; color: string; dashed?: boolean }[] = [];
  const stage = (col: number, i: number, id: string, title: string, sub: string, tipRows: [string, string][]): Box => ({ id: `${id}-${i}`, x: colX[col], y: lanes[i], w: BW, h: BH, title, sub, color: pathColor(i), tip: tipRows });
  const link = (a: Box, b: Box, color: string, dashed?: boolean) => { const midX = (a.x + a.w + b.x) / 2; links.push({ d: `M${a.x + a.w},${a.y + a.h / 2} H${midX} V${b.y + b.h / 2} H${b.x}`, color, dashed }); };

  lanes.forEach((_, i) => {
    const feed = feeds[i] ?? feeds[0];
    const feedTitle = feed?.name ?? 'Utility feed';
    const f = stage(0, i, 'feed', feedTitle, feed ? `${fmtKw(feed.capacityKw)} · ${feed.redundancy}` : 'intake', [['Capacity', feed ? fmtKw(feed.capacityKw) : '—'], ['Role', feed?.redundancy ?? '—']]);
    const txN = dual ? half(cnt(tx)) : cnt(tx);
    const t = stage(1, i, 'tx', `Transformer${txN === 1 ? '' : 's'}${sideLabel(i)}`, `${txN} × ${fmtKw(tx[0]?.capacityKw ?? 0)}`, [['Units', String(txN)], ['Each', fmtKw(tx[0]?.capacityKw ?? 0)], ['Name', tx[0]?.name ?? '—'], ['Redundancy', tx[0]?.redundancy ?? redundancy]]);
    const sg = stage(2, i, 'sg', `Switchgear${sideLabel(i)}`, `${fmtKw(sizing.itKw)} board${spare ? ' · +1 section' : ''}`, [['Rating', fmtKw(sizing.itKw)], ['Redundancy', redundancy]]);
    const upsN = dual ? half(cnt(ups)) : cnt(ups);
    const upsKw = sum(ups) / Math.max(1, dual ? 2 : 1);
    const u = stage(3, i, 'ups', `${ups[0]?.name ?? 'UPS'}${sideLabel(i)}`, `${upsN} × ${fmtKw(ups[0]?.capacityKw ?? 0)} · ${fmtKw(upsKw)}`, [['Modules', String(upsN)], ['Each', fmtKw(ups[0]?.capacityKw ?? 0)], ['Path capacity', fmtKw(upsKw)], ['Redundancy', ups[0]?.redundancy ?? redundancy]]);
    const pduN = dual ? half(cnt(pdus)) : cnt(pdus);
    const d = stage(4, i, 'pdu', `${pdus[0]?.name ?? 'PDUs'}${sideLabel(i)}`, `${pduN} × ${fmtKw(pdus[0]?.capacityKw ?? 0)}`, [['Units', String(pduN)], ['Each', fmtKw(pdus[0]?.capacityKw ?? 0)], ['Redundancy', pdus[0]?.redundancy ?? redundancy]]);
    boxes.push(f, t, sg, u, d);
    link(f, t, pathColor(i)); link(t, sg, pathColor(i)); link(sg, u, pathColor(i)); link(u, d, pathColor(i));
    links.push({ d: `M${d.x + d.w},${d.y + d.h / 2} H${(d.x + d.w + itX) / 2} V${itY + 30} H${itX}`, color: pathColor(i) });
  });
  if (spare) {
    boxes.push({ id: 'ups-spare', x: colX[3], y: lanes[0] + BH + 10, w: BW, h: 30, title: '+1 spare module', sub: fmtKw(ups[0]?.capacityKw ?? 0), color: p.slate, dashed: true, tip: [['Role', 'N+1 spare'], ['Capacity', fmtKw(ups[0]?.capacityKw ?? 0)]] });
    links.push({ d: `M${colX[3] + BW / 2},${lanes[0] + BH} V${lanes[0] + BH + 10}`, color: p.slate, dashed: true });
  }
  const it: Box = { id: 'it', x: itX, y: itY, w: 100, h: 60, title: 'IT load', sub: `${fmtKw(sizing.itKw)} · ${fmtInt(sizing.racks)} racks`, color: p.ink, tip: [['Design load', fmtKw(sizing.itKw)], ['Racks', fmtInt(sizing.racks)], ['Halls', String(sizing.halls)], ['PUE', sizing.pue.value.toFixed(2)]] };
  boxes.push(it);
  if (gens.length) {
    const g: Box = { id: 'gen', x: colX[1], y: genY, w: BW, h: BH, title: gens[0].name, sub: `${cnt(gens)} × ${fmtKw(gens[0].capacityKw)} · ${gens[0].redundancy}`, color: p.amber, tip: [['Units', String(cnt(gens))], ['Each', fmtKw(gens[0].capacityKw)], ['Total', fmtKw(sum(gens))], ['Redundancy', gens[0].redundancy]] };
    boxes.push(g);
    lanes.forEach((ly, i) => links.push({ d: `M${g.x + g.w},${g.y + g.h / 2} H${colX[2] + BW / 2 + (i ? 12 : -12)} V${ly + BH}`, color: p.amber, dashed: true }));
  }
  // Cooling lane
  const cool0 = cooling[0];
  const coolingBoxes: Box[] = [];
  if (cool0) {
    if (chilled) coolingBoxes.push({ id: 'chiller', x: colX[2], y: coolY, w: BW, h: BH, title: 'Chillers', sub: `${Math.max(1, Math.ceil((sizing.itKw * 1.1) / 1500) + 1)} × 1.5 MW · N+1`, color: p.cyan, tip: [['Chillers', String(Math.max(1, Math.ceil((sizing.itKw * 1.1) / 1500) + 1))], ['Each', '1.5 MW'], ['Redundancy', 'N+1']] });
    coolingBoxes.push({ id: 'cool', x: colX[3], y: coolY, w: BW, h: BH, title: cool0.name, sub: `${cool0.count} × ${fmtKw(cool0.capacityKw)} · ${cool0.redundancy}`, color: p.cyan, tip: [['Units', String(cool0.count)], ['Each', fmtKw(cool0.capacityKw)], ['Total', fmtKw(sizing.cooling.capacityKw)], ['Redundancy', cool0.redundancy], ['Type', sizing.cooling.type]] });
    if (cdu) coolingBoxes.push({ id: 'manifold', x: colX[4], y: coolY, w: BW, h: BH, title: 'Coolant manifolds', sub: `${Math.max(1, sizing.halls)} per hall · ${sizing.cooling.liquidRequired ? 'required' : 'elected'}`, color: p.cyan, tip: [['Liquid loop', 'secondary'], ['Halls', String(sizing.halls)]] });
    coolingBoxes.forEach((b, i) => { const n = coolingBoxes[i + 1]; if (n) link(b, n, p.cyan); });
    const last = coolingBoxes[coolingBoxes.length - 1];
    links.push({ d: `M${last.x + last.w},${last.y + last.h / 2} H${itX + 50} V${it.y + it.h}`, color: p.cyan });
  }
  const all = [...boxes, ...coolingBoxes];
  const w = Math.max(320, width);
  const sc = w / W;
  const svgH = Math.max(height, H * sc);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={svgH} style={{ display: 'block' }} onMouseLeave={hide}>
        <g transform={`translate(${(w - W * sc) / 2},${(svgH - H * sc) / 2}) scale(${sc})`}>
          <text x={10} y={lanes[0] - 20} fontSize={11} fontWeight={600} fill={p.ink}>Power · {redundancy}</text>
          {dual && <text x={10} y={lanes[0] - 6} fontSize={10} fill={p.slate}>Two independent paths; either carries the full load.</text>}
          {spare && <text x={10} y={lanes[0] - 6} fontSize={10} fill={p.slate}>Single path with one spare module at each stage.</text>}
          <text x={10} y={coolY + 18} fontSize={11} fontWeight={600} fill={p.ink}>Cooling</text>
          <text x={10} y={coolY + 32} fontSize={10} fill={p.slate}>{sizing.cooling.type} · {sizing.cooling.redundancy}</text>
          {links.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2} strokeDasharray={l.dashed ? '5 4' : undefined} opacity={0.9} strokeLinejoin="round" />)}
          {all.map((b) => (
            <g key={b.id} transform={`translate(${b.x},${b.y})`} onMouseMove={(e) => show(e, <TipRows title={b.title} rows={b.tip} />)} style={{ cursor: 'default' }}>
              <rect width={b.w} height={b.h} rx={6} fill={p.surface} stroke={b.color} strokeWidth={b.id === 'it' ? 2 : 1.5} strokeDasharray={b.dashed ? '4 3' : undefined} />
              <rect width={4} height={b.h} rx={2} fill={b.color} />
              <text x={12} y={b.h >= 40 ? 18 : 13} fontSize={b.h >= 40 ? 11 : 10} fontWeight={600} fill={p.ink}>{b.title.length > 20 ? `${b.title.slice(0, 19)}…` : b.title}</text>
              <text x={12} y={b.h >= 40 ? 34 : 24} fontSize={10} fill={p.slate}>{b.sub}</text>
            </g>
          ))}
        </g>
      </svg>
      <ChartTip tip={tip} width={w} />
      <Legend style={{ marginTop: 6 }} items={[{ label: dual ? 'Path A' : 'Power path', color: p.blue, kind: 'line' }, ...(dual ? [{ label: 'Path B', color: p.violet, kind: 'line' as const }] : []), { label: 'Generator backup', color: p.amber, kind: 'dash' }, { label: 'Cooling', color: p.cyan, kind: 'line' }, ...(spare ? [{ label: 'N+1 spare', color: p.slate, kind: 'dash' as const }] : [])]} />
    </div>
  );
}
