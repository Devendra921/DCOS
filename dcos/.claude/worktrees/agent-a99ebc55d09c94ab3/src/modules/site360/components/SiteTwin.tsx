/**
 * Site 360 — the drillable twin (three.js via react-three-fiber).
 *
 * One canvas, four levels. Site: buildings on the campus pad with the plant behind them
 * (utility intake, UPS rooms, cooling units). Building: floors stacked with their halls.
 * Hall: racks on the real grid with aisles, cooling units and floor PDUs. Rack: the
 * devices in their U positions. Every level colours by the active layer, carries floating
 * labels, and drills on click. Camera presets (overview, front, top, aisle) glide between
 * views. Readouts are a DOM overlay positioned from the pointer.
 *
 * On top of the geometry: pulsing attention beacons (incidents, alarms, hot inlets, power
 * near budget, failed plant) that show through slabs; dashed, translucent ghosts for
 * planned and reserved racks and inbound devices; floors that lift and dim around the
 * hall in focus; and device labels that collapse runs of 1U kit ("8 × srv").
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import { capacityThresholds } from '../../../mock/data/dcTypes';
import type { Device } from '../../../mock/data/types';
import type { BuildingVm, HallVm, RackVm, SiteLayer, SiteModel, TwinLevel, TwinView, VwPalette } from '../lib/siteModel';
import { rackColor, aggregateColor, deviceColor } from '../lib/siteModel';
import { computeAttention, type AttentionItem, type AttentionSeverity, type SiteAttention } from '../lib/attention';

export interface SiteTwinProps {
  model: SiteModel; level: TwinLevel; layer: SiteLayer; view: TwinView; palette: VwPalette; selectedRackId?: string;
  onDrill: (l: TwinLevel) => void; onSelectRack: (id?: string) => void; onOpenDevice?: (id: string) => void; height?: number;
  /** Pre-computed attention (from useAttention); computed from the model when omitted. */
  attention?: SiteAttention;
  /** At building level: the hall to keep in focus (floors above it lift, everything else dims). Hovering a hall focuses it too. */
  focusHallId?: string;
}
interface Hover { x: number; y: number; title: string; lines: string[] }
type PE = ThreeEvent<PointerEvent>;
type LabelTone = 'neutral' | 'error' | 'warning' | 'info';

const RACK_W = 0.6; const RACK_D = 1.1; const PITCH_X = 0.75; const ROW_PITCH = 2.6; const U_HALL = 2.0 / 42; const U_RACK = 0.05;
/** Storey height, how far floors above the focus lift, and the opacity of everything out of focus. */
const FH = 2.2; const LIFT = 2.2; const DIM = 0.25;
/** Lifecycle states of kit that is on its way but not yet in the rack. */
const INBOUND = new Set<string>(['Ordered', 'Received', 'Staged']);
const isGhostRack = (vm: RackVm) => vm.planned || vm.rack.status === 'Reserved';
const ghostRackLabel = (vm: RackVm) => (vm.planned ? 'Planned' : 'Reserved');
const isGhostDevice = (d: Device) => !!d.lifecycleState && INBOUND.has(d.lifecycleState);
const noRaycast = () => undefined;
const fmtUsd = (n: number) => `$${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n}`;
const attentionTone = (it?: AttentionItem): LabelTone => (it ? (it.severity === 'critical' ? 'error' : 'warning') : 'neutral');

/** Floating label pill, styled from the design system. `anchor="left"` hangs the pill to the right of its point. */
function Label({ position, text, sub, tone = 'neutral', anchor = 'center', size = 11 }: { position: [number, number, number]; text: string; sub?: string; tone?: LabelTone; anchor?: 'center' | 'left'; size?: number }) {
  return (
    <Html position={position} center={anchor === 'center'} zIndexRange={[20, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap', ...(anchor === 'left' ? { transform: 'translate3d(0,-50%,0)' } : {}) }}>
      <span className={`vw-chip vw-chip--${tone}`} style={{ fontSize: size, fontWeight: 600, boxShadow: '0 2px 8px rgba(15,23,42,0.18)' }}>{text}{sub ? <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>{sub}</span> : null}</span>
    </Html>
  );
}

/** Glides the camera to a preset whenever the level or view changes. */
function CameraRig({ pos, target }: { pos: [number, number, number]; target: [number, number, number] }) {
  const { camera, controls } = useThree();
  const want = useRef({ pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) });
  useEffect(() => { want.current = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) }; }, [pos, target]);
  useFrame(() => {
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (camera.position.distanceTo(want.current.pos) > 0.02) camera.position.lerp(want.current.pos, 0.12);
    if (c) { if (c.target.distanceTo(want.current.target) > 0.02) c.target.lerp(want.current.target, 0.12); c.update(); }
  });
  return null;
}

function presetFor(level: TwinLevel['kind'], view: TwinView, w: number, d: number, h: number): { pos: [number, number, number]; target: [number, number, number] } {
  const span = Math.max(w, d);
  if (level === 'rack') {
    const mid: [number, number, number] = [0, h / 2, 0];
    switch (view) {
      case 'top': return { pos: [0.01, h + 4, 0.01], target: mid };
      case 'front': return { pos: [0, h / 2, h * 2.4 + 1.5], target: mid };
      case 'aisle': return { pos: [1.0, h * 0.45, 2.0], target: [0, h * 0.45, 0] };
      default: return { pos: [h * 1.4, h * 1.3, h * 2.0], target: mid };
    }
  }
  const target: [number, number, number] = [0, h * 0.35, 0];
  switch (view) {
    case 'top': return { pos: [0.01, span * 1.6 + h, 0.01], target: [0, 0, 0] };
    case 'front': return { pos: [0, h * 0.6 + span * 0.25, d / 2 + span * 0.9], target };
    case 'aisle': return level === 'hall' ? { pos: [-w / 2 - 1, 1.5, ROW_PITCH / 2 - d / 2 + ROW_PITCH], target: [w / 2, 1.2, ROW_PITCH / 2 - d / 2 + ROW_PITCH] } : { pos: [span * 0.5, h * 0.5 + 2, d / 2 + span * 0.4], target };
    default: return { pos: [span * 0.75, span * 0.6 + h, span * 0.95], target };
  }
}

// ── Motion helpers: lifting groups and dimming materials, each eased in useFrame with no per-frame allocation ──

/** A group whose height eases towards `y` (starts at `from`, or at `y` when omitted). */
function LiftGroup({ y, from, children }: { y: number; from?: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef(from ?? y);
  useLayoutEffect(() => { if (ref.current) ref.current.position.y = start.current; }, []);
  useFrame(() => {
    const g = ref.current; if (!g) return;
    const d = y - g.position.y;
    if (Math.abs(d) > 0.002) g.position.y += d * 0.12; else if (g.position.y !== y) g.position.y = y;
  });
  return <group ref={ref}>{children}</group>;
}

function useDim<T extends THREE.Material>(opacity: number) {
  const ref = useRef<T>(null);
  const start = useRef(opacity);
  useLayoutEffect(() => { if (ref.current) ref.current.opacity = start.current; }, []);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    const d = opacity - m.opacity;
    if (Math.abs(d) > 0.003) m.opacity += d * 0.15; else if (m.opacity !== opacity) m.opacity = opacity;
  });
  return ref;
}
/** Standard material whose opacity eases towards the prop. */
function DimStandard({ opacity, color, roughness = 0.6, metalness = 0 }: { opacity: number; color: string; roughness?: number; metalness?: number }) {
  const ref = useDim<THREE.MeshStandardMaterial>(opacity);
  return <meshStandardMaterial ref={ref} transparent color={color} roughness={roughness} metalness={metalness} />;
}
/** Unlit material whose opacity eases towards the prop. */
function DimBasic({ opacity, color, depthWrite = true }: { opacity: number; color: string; depthWrite?: boolean }) {
  const ref = useDim<THREE.MeshBasicMaterial>(opacity);
  return <meshBasicMaterial ref={ref} transparent color={color} depthWrite={depthWrite} />;
}

// ── Attention beacons: a thin stalk and a pulsing sphere, drawn through slabs ──
interface BeaconSpec { key: string; position: [number, number, number]; item: AttentionItem; onClick?: () => void }

/** One component animates every beacon of a scene: two shared materials pulse, each sphere breathes. */
function Beacons({ items, p, size, stalk, hover }: { items: BeaconSpec[]; p: VwPalette; size: number; stalk: number; hover: (h: Hover | null) => void }) {
  const mats = useMemo(() => {
    const mk = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
    return { red: mk(p.red, 1), amber: mk(p.amber, 1), redStalk: mk(p.red, 0.7), amberStalk: mk(p.amber, 0.7) };
  }, [p.red, p.amber]);
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(size, 14, 12), [size]);
  const stalkGeo = useMemo(() => new THREE.CylinderGeometry(size * 0.14, size * 0.14, stalk, 6), [size, stalk]);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); }, [mats]);
  useEffect(() => () => { sphereGeo.dispose(); stalkGeo.dispose(); }, [sphereGeo, stalkGeo]);
  const spheres = useRef<Array<THREE.Mesh | null>>([]);
  if (spheres.current.length !== items.length) spheres.current.length = items.length;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    mats.red.opacity = 0.45 + 0.55 * pulse; mats.amber.opacity = 0.5 + 0.45 * pulse;
    const s = 0.8 + 0.45 * pulse;
    const arr = spheres.current;
    for (let i = 0; i < arr.length; i++) { const m = arr[i]; if (m) m.scale.setScalar(s); }
  });
  const readout = (e: PE, it: AttentionItem): Hover => ({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: `${it.name} · ${it.severity === 'critical' ? 'critical' : 'major'}`, lines: [...it.reasons, it.kind === 'rack' ? 'Click to open the rack' : it.kind === 'hall' ? 'Click to open the hall' : 'Click to open the building'] });
  return (
    <group>
      {items.map((b, i) => {
        const critical = b.item.severity === 'critical';
        return (
          <group key={b.key} position={b.position}>
            <mesh geometry={stalkGeo} material={critical ? mats.redStalk : mats.amberStalk} position={[0, stalk / 2, 0]} renderOrder={20} raycast={noRaycast} />
            <mesh ref={(m) => { spheres.current[i] = m; }} geometry={sphereGeo} material={critical ? mats.red : mats.amber} position={[0, stalk + size, 0]} renderOrder={21}
              onPointerOver={(e: PE) => { e.stopPropagation(); hover(readout(e, b.item)); }} onPointerOut={() => hover(null)} onClick={(e) => { e.stopPropagation(); b.onClick?.(); }} />
          </group>
        );
      })}
    </group>
  );
}

// ── Reserved ghosts: dashed outline around a translucent block ──
function DashedBox({ args, color, dash, opacity = 0.9 }: { args: [number, number, number]; color: string; dash: number; opacity?: number }) {
  const [w, h, d] = args;
  const obj = useMemo(() => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const mat = new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash * 0.6, transparent: true, opacity });
    const ls = new THREE.LineSegments(geo, mat); ls.computeLineDistances(); ls.raycast = noRaycast;
    return ls;
  }, [w, h, d, color, dash, opacity]);
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
}

/** Collapses consecutive same-status ghost racks in a row into one label ("Planned × 6"). */
function ghostRackLabels(racks: RackVm[]): Array<{ key: string; text: string; sub?: string; gridX: number; gridY: number; h: number }> {
  const ghosts = racks.filter(isGhostRack).sort((a, b) => a.rack.gridY - b.rack.gridY || a.rack.gridX - b.rack.gridX);
  const out: Array<{ key: string; text: string; sub?: string; gridX: number; gridY: number; h: number }> = [];
  let i = 0;
  while (i < ghosts.length) {
    let j = i; const g = ghosts[i]; const lab = ghostRackLabel(g);
    while (j + 1 < ghosts.length && ghosts[j + 1].rack.gridY === g.rack.gridY && ghosts[j + 1].rack.gridX === ghosts[j].rack.gridX + 1 && ghostRackLabel(ghosts[j + 1]) === lab) j++;
    const n = j - i + 1;
    out.push({ key: g.rack.id, text: lab, sub: n > 1 ? `× ${n}` : undefined, gridX: (g.rack.gridX + ghosts[j].rack.gridX) / 2, gridY: g.rack.gridY, h: Math.max(...ghosts.slice(i, j + 1).map((r) => Math.max(0.2, r.rack.heightU * U_HALL))) });
    i = j + 1;
  }
  return out;
}

// ── Rack-level device labels: runs of same-prefix 1U devices collapse to one label ──
interface DeviceLabel { key: string; y: number; text: string; sub?: string; tone: LabelTone; weight: number }
const namePrefix = (n: string) => n.replace(/[-_ .]?\d+[a-z]?$/i, '') || n;
export function deviceLabels(placed: Device[], maxLabels = 14): DeviceLabel[] {
  const sorted = [...placed].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const out: DeviceLabel[] = [];
  const yOf = (d: Device) => ((d.position ?? 1) - 1) * U_RACK + ((d.heightU ?? 1) * U_RACK) / 2;
  let i = 0;
  while (i < sorted.length) {
    const d = sorted[i]; const ghost = isGhostDevice(d);
    if ((d.heightU ?? 1) === 1) {
      const pre = namePrefix(d.name); let j = i;
      while (j + 1 < sorted.length && (sorted[j + 1].heightU ?? 1) === 1 && namePrefix(sorted[j + 1].name) === pre && isGhostDevice(sorted[j + 1]) === ghost) j++;
      const n = j - i + 1;
      if (n >= 2) {
        out.push({ key: d.id, y: (yOf(d) + yOf(sorted[j])) / 2, text: `${n} × ${pre}`, sub: ghost ? 'Reserved' : `U${d.position}–${sorted[j].position}`, tone: ghost ? 'neutral' : 'info', weight: 3 });
        i = j + 1; continue;
      }
    }
    const faulty = d.status === 'Faulty';
    out.push({ key: d.id, y: yOf(d), text: d.name, sub: ghost ? 'Reserved' : undefined, tone: faulty ? 'error' : ghost ? 'neutral' : 'info', weight: faulty ? 4 : ghost ? 3 : (d.heightU ?? 1) >= 2 ? 2 : 1 });
    i++;
  }
  // Too many singletons still overlap: keep runs, ghosts, faults and tall kit; drop plain 1U one-offs.
  return out.length > maxLabels ? out.filter((l) => l.weight > 1) : out;
}

// ── Site level: buildings on the pad, plant behind ──
const bands = (key?: string | null) => { const t = capacityThresholds(key); return { warnPct: t.rackPowerWarnPct, blockPct: t.rackPowerBlockPct }; };

function SiteScene({ model, layer, p, onDrill, hover, attention }: { model: SiteModel; layer: SiteLayer; p: VwPalette; onDrill: (l: TwinLevel) => void; hover: (h: Hover | null) => void; attention: SiteAttention }) {
  const thr = bands(model.dc?.dcTypeKey);
  const items = useMemo(() => {
    const gap = 3; let x = 0;
    const list = model.buildings.map((b) => { const w = Math.max(6, b.halls.length * 3.2); const h = Math.max(1, b.floors.length) * FH; const item = { b, w, d: 8, h, x }; x += w + gap; return item; });
    const total = x - gap; list.forEach((it) => { it.x -= total / 2 - it.w / 2; });
    return { list, total };
  }, [model.buildings]);
  const costPeerMax = useMemo(() => model.buildings.reduce((m, b) => Math.max(m, b.costUsd), 0), [model.buildings]);
  const beacons = useMemo<BeaconSpec[]>(() => items.list.flatMap(({ b, w, d, h, x }) => { const it = attention.buildings.get(b.building.id); return it ? [{ key: b.building.id, position: [x + w / 2 - 0.7, h, d / 2 - 0.7] as [number, number, number], item: it, onClick: () => onDrill({ kind: 'building', id: b.building.id }) }] : []; }), [items, attention, onDrill]);
  const pad = Math.max(20, items.total + 10);
  const plantZ = -8; const coolZ = -11.5; const utilX = -items.total / 2 - 6;
  const statusCol = (s: string) => (s === 'Failed' ? p.red : s === 'Degraded' || s === 'Maintenance' ? p.amber : p.slate);
  return (
    <group>
      <Grid args={[pad, pad * 0.7]} cellSize={2} sectionSize={10} cellColor={p.grid} sectionColor={p.slateLight} fadeDistance={120} position={[0, -0.001, -2]} />
      {items.list.map(({ b, w, d, h, x }) => (
        <group key={b.building.id} position={[x, 0, 0]}>
          <mesh position={[0, h / 2, 0]} onClick={(e) => { e.stopPropagation(); onDrill({ kind: 'building', id: b.building.id }); }} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: b.building.name, lines: [`${b.floors.length} floors · ${b.halls.length} halls · ${b.racks.length} racks`, `${b.itKw} kW IT of ${b.maxKw} kW · ${b.incidents} open incidents · ${b.alarms} alarms`, `≈ ${fmtUsd(b.costUsd)}/month energy`, 'Click to open the building'] }); }} onPointerOut={() => hover(null)}>
            <boxGeometry args={[w, h, d]} /><meshStandardMaterial color={aggregateColor(b, layer, p, thr, costPeerMax)} roughness={0.6} /><Edges color={p.slateDark} />
          </mesh>
          {/* floor lines between storeys (the roof stays clean) */}
          {b.floors.slice(0, -1).map((fl, i) => <mesh key={fl.floor.id} position={[0, (i + 1) * FH, 0]}><boxGeometry args={[w + 0.06, 0.05, d + 0.06]} /><meshBasicMaterial color={p.slateDark} /></mesh>)}
          <Label position={[0, h + 0.9, 0]} text={b.building.name} sub={`${b.racks.length} racks · ${b.itKw} kW`} tone={attentionTone(attention.buildings.get(b.building.id))} />
          {/* UPS room behind each building */}
          {model.ups.slice(0, 2).map((u, k) => (
            <mesh key={u.id} position={[-w / 4 + k * (w / 2), 0.7, plantZ + (b.building.name.includes('B') ? -1 : 0)]} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: u.name, lines: [`${u.loadKw}/${u.capacityKw} kW (${u.loadPct}%) · ${u.redundancy}`, `${u.runtimeMinutes} min ride-through · ${u.status}`] }); }} onPointerOut={() => hover(null)}>
              <boxGeometry args={[2.4, 1.4, 1.6]} /><meshStandardMaterial color={statusCol(u.status)} roughness={0.7} /><Edges color={p.ink} />
            </mesh>
          ))}
        </group>
      ))}
      <Beacons items={beacons} p={p} size={0.28} stalk={1.0} hover={hover} />
      <Label position={[0, 2.4, plantZ]} text="UPS rooms" sub={`${model.ups.length} units`} tone={model.ups.some((u) => u.status === 'Failed') ? 'error' : model.ups.some((u) => u.status !== 'Operational') ? 'warning' : 'neutral'} />
      {/* Cooling plant along the back */}
      {model.cracs.map((c, i) => {
        const x = -items.total / 2 + (i + 0.5) * (items.total / Math.max(1, model.cracs.length));
        return (
          <mesh key={c.id} position={[x, 0.5, coolZ]} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: `${c.name} · ${c.type}`, lines: [`${c.status} · ${c.capacityKw} kW`, `supply ${c.supplyTempC} °C · return ${c.returnTempC} °C`] }); }} onPointerOut={() => hover(null)}>
            <boxGeometry args={[1.1, 1.0, 0.9]} /><meshStandardMaterial color={statusCol(c.status)} roughness={0.7} /><Edges color={p.ink} />
          </mesh>
        );
      })}
      <Label position={[0, 2.0, coolZ]} text="Cooling plant" sub={`${model.cracs.length} units · ${model.cracs.filter((c) => c.status === 'Failed').length} failed`} tone={model.cracs.some((c) => c.status === 'Failed') ? 'error' : 'neutral'} />
      {/* Utility intake with transformers on the left */}
      {model.feeds.map((f, i) => {
        const tx = model.transformers.find((t) => t.feedId === f.id);
        return (
          <group key={f.id} position={[utilX, 0, -2 + i * 3]}>
            <mesh position={[0, 1.3, 0]} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: f.name, lines: [`${f.capacityKw} kW at ${f.voltage} V · ${f.provider}`, tx ? `${tx.name}: ${tx.loadKw} kW of ${Math.round(tx.capacityKva * 0.9)} kW · ${tx.status}` : 'LV intake'] }); }} onPointerOut={() => hover(null)}>
              <boxGeometry args={[0.9, 2.6, 0.9]} /><meshStandardMaterial color={f.redundancyRole === 'B-side' ? p.cyan : p.blue} roughness={0.6} /><Edges color={p.ink} />
            </mesh>
            {tx && <mesh position={[1.6, 0.6, 0]}><boxGeometry args={[1.4, 1.2, 1.2]} /><meshStandardMaterial color={statusCol(tx.status)} roughness={0.7} /><Edges color={p.ink} /></mesh>}
          </group>
        );
      })}
      <Label position={[utilX + 0.8, 3.6, -0.5]} text="Utility intake" sub={model.feeds.map((f) => f.redundancyRole[0]).join(' / ')} tone="info" />
    </group>
  );
}

// ── Building level: floors with their halls; the floor in focus stays put, floors above lift, the rest dims ──
function BuildingScene({ b, model, layer, p, onDrill, hover, attention, focusHallId }: { b: BuildingVm; model: SiteModel; layer: SiteLayer; p: VwPalette; onDrill: (l: TwinLevel) => void; hover: (h: Hover | null) => void; attention: SiteAttention; focusHallId?: string }) {
  const thr = bands(model.dc?.dcTypeKey);
  const [hoverHall, setHoverHall] = useState<string | undefined>();
  const focus = hoverHall ?? focusHallId;
  const focusFloor = focus ? b.floors.findIndex((f) => f.halls.some((h) => h.hall.id === focus)) : -1;
  const multi = b.floors.length > 1;
  const maxHalls = Math.max(1, ...b.floors.map((f) => f.halls.length));
  const W = Math.max(8, maxHalls * 4.2); const D = 6.5;
  const costPeerMax = useMemo(() => b.halls.reduce((m, h) => Math.max(m, h.costUsd), 0), [b.halls]);
  const hallX = (fv: BuildingVm['floors'][number], k: number) => -W / 2 + 2.1 + k * 4.2 + (W - fv.halls.length * 4.2) / 2;
  return (
    <group>
      <Grid args={[W + 6, D + 6]} cellSize={1} sectionSize={5} cellColor={p.grid} sectionColor={p.slateLight} fadeDistance={60} position={[0, -0.001, 0]} />
      {b.floors.map((fv, i) => {
        const lifted = multi && focusFloor >= 0 && i > focusFloor;
        const floorDim = focusFloor >= 0 && i !== focusFloor;
        const beacons: BeaconSpec[] = fv.halls.flatMap((h, k) => { const it = attention.halls.get(h.hall.id); return it ? [{ key: h.hall.id, position: [hallX(fv, k) + 1.4, 1.02, 1.9] as [number, number, number], item: it, onClick: () => onDrill({ kind: 'hall', id: h.hall.id }) }] : []; });
        return (
          <LiftGroup key={fv.floor.id} y={i * FH + (lifted ? LIFT : 0)}>
            <mesh position={[0, 0.06, 0]} raycast={noRaycast}><boxGeometry args={[W, 0.12, D]} /><DimStandard color={p.surface} opacity={floorDim ? DIM : 0.9} roughness={0.9} /><Edges color={p.slateLight} /></mesh>
            {[[-W / 2, 0], [W / 2, 0]].map(([x], k) => <mesh key={k} position={[x, FH / 2, -D / 2]} raycast={noRaycast}><boxGeometry args={[0.1, FH, 0.1]} /><DimBasic color={p.slateLight} opacity={floorDim ? DIM : 1} /></mesh>)}
            <Label position={[-W / 2 - 1.4, 0.6, 0]} text={fv.floor.name} sub={`${fv.halls.length} halls${lifted ? ' · lifted' : ''}`} />
            {fv.halls.map((h, k) => {
              const dim = !!focus && h.hall.id !== focus;
              const it = attention.halls.get(h.hall.id);
              return (
                <group key={h.hall.id} position={[hallX(fv, k), 0.12, 0]}>
                  <mesh position={[0, 0.45, 0]} onClick={(e) => { e.stopPropagation(); onDrill({ kind: 'hall', id: h.hall.id }); }} onPointerOver={(e: PE) => { e.stopPropagation(); setHoverHall(h.hall.id); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: h.hall.name, lines: [`${h.racks.length}/${h.hall.rackCapacity} positions · ${h.itKw} kW of ${h.hall.designPowerKw} kW design`, `${h.rows[0]?.containment ?? 'No'} containment · zone ${h.zone?.name ?? '—'} · ${h.incidents} incidents`, `≈ ${fmtUsd(h.costUsd)}/month energy${it ? ` · ${it.reasons[0]}` : ''}`, 'Click to open the hall'] }); }} onPointerOut={() => { setHoverHall(undefined); hover(null); }}>
                    <boxGeometry args={[3.6, 0.9, 4.6]} /><DimStandard color={aggregateColor(h, layer, p, thr, costPeerMax)} opacity={dim ? DIM : 1} roughness={0.6} /><Edges color={dim ? p.slateLight : p.slateDark} />
                  </mesh>
                  {/* rack rows hinted on the hall slab */}
                  {!dim && Array.from({ length: Math.min(6, h.hall.gridRows) }, (_, r) => <mesh key={r} position={[0, 0.92, -2.0 + (r + 0.5) * (4.2 / Math.min(6, h.hall.gridRows))]} raycast={noRaycast}><boxGeometry args={[3.0, 0.06, 0.25]} /><meshBasicMaterial color={p.ink} transparent opacity={0.25} /></mesh>)}
                  <Label position={[0, 1.6, 0]} text={h.hall.name} sub={`${h.racks.length} racks · ${h.itKw} kW`} tone={attentionTone(it)} />
                </group>
              );
            })}
            <Beacons items={beacons} p={p} size={0.18} stalk={0.7} hover={hover} />
          </LiftGroup>
        );
      })}
    </group>
  );
}

// ── Hall level: racks on the grid ──
function RackBox({ vm, layer, p, selected, hovered, onHover, onSelect, onOpen, x, z, costPeerMax }: { vm: RackVm; layer: SiteLayer; p: VwPalette; selected: boolean; hovered: boolean; onHover: (h: Hover | null, id?: string) => void; onSelect: (id?: string) => void; onOpen: () => void; x: number; z: number; costPeerMax: number }) {
  const h = Math.max(0.2, vm.rack.heightU * U_HALL);
  const color = rackColor(vm, layer, p, costPeerMax); const ghost = isGhostRack(vm);
  const readout = (e: PE): Hover => ({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: `${vm.rack.name} · ${vm.rack.purpose}${ghost ? ` · ${ghostRackLabel(vm).toLowerCase()}` : ''}`, lines: [`${vm.rack.usedU}/${vm.rack.heightU} U · ${vm.rack.currentPowerKw}/${vm.rack.maxPowerKw} kW (${vm.powerPct}%) · ${vm.inletC} °C inlet · ≈ ${fmtUsd(vm.costUsd)}/mo`, `${vm.deviceCount} devices · ${vm.rack.owner}${vm.incidents ? ` · ${vm.incidents} open incident${vm.incidents > 1 ? 's' : ''}` : ''}${vm.alarms ? ` · ${vm.alarms} alarms` : ''}`, 'Click to pin · double-click to open the rack'] });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} onPointerOver={(e: PE) => { e.stopPropagation(); onHover(readout(e), vm.rack.id); }} onPointerMove={(e: PE) => { e.stopPropagation(); onHover(readout(e), vm.rack.id); }} onPointerOut={(e: PE) => { e.stopPropagation(); onHover(null); }} onClick={(e) => { e.stopPropagation(); onSelect(selected ? undefined : vm.rack.id); }} onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}>
        <boxGeometry args={[RACK_W, h, RACK_D]} />
        <meshStandardMaterial color={color} transparent={ghost} opacity={ghost ? 0.18 : 1} depthWrite={!ghost} roughness={0.55} metalness={0.1} emissive={selected || hovered ? color : '#000000'} emissiveIntensity={selected ? 0.5 : hovered ? 0.25 : 0} />
        {ghost ? <DashedBox args={[RACK_W, h, RACK_D]} color={selected ? p.ink : vm.planned ? p.slate : p.amber} dash={0.09} /> : <Edges color={selected ? p.ink : p.slateDark} threshold={15} />}
      </mesh>
      {!ghost && vm.usedPct > 0 && <mesh position={[0, (h * vm.usedPct) / 200, RACK_D / 2 + 0.001]} raycast={noRaycast}><planeGeometry args={[RACK_W * 0.9, (h * vm.usedPct) / 100]} /><meshBasicMaterial color={p.ink} transparent opacity={0.18} /></mesh>}
    </group>
  );
}

/** The other floors of the building around the hall in view: faint slabs, those above lifted out of the way. */
function FloorStack({ building, hallId, width, depth, p }: { building: BuildingVm; hallId: string; width: number; depth: number; p: VwPalette }) {
  const idx = building.floors.findIndex((f) => f.halls.some((h) => h.hall.id === hallId));
  if (idx < 0 || building.floors.length < 2) return null;
  return (
    <group>
      {building.floors.map((fv, i) => {
        if (i === idx) return null;
        const base = (i - idx) * FH; const above = i > idx;
        return (
          <LiftGroup key={fv.floor.id} y={base + (above ? LIFT : 0)} from={base}>
            <mesh position={[0, 0.06, 0]} raycast={noRaycast}><boxGeometry args={[width + 3, 0.12, depth + 3]} /><DimBasic color={p.slateLight} opacity={0.12} depthWrite={false} /><Edges color={p.slateLight} /></mesh>
            <Label position={[-(width + 3) / 2 - 0.8, 0.3, 0]} text={fv.floor.name} sub={`${fv.halls.length} halls${above ? ' · lifted' : ''}`} size={10} />
          </LiftGroup>
        );
      })}
    </group>
  );
}

function HallScene({ hall, building, layer, p, selectedId, onSelect, onDrill, hover, setHoverId, hoverId, attention }: { hall: HallVm; building?: BuildingVm; layer: SiteLayer; p: VwPalette; selectedId?: string; onSelect: (id?: string) => void; onDrill: (l: TwinLevel) => void; hover: (h: Hover | null) => void; setHoverId: (id?: string) => void; hoverId?: string; attention: SiteAttention }) {
  const cols = Math.max(1, hall.hall.gridCols); const rows = Math.max(1, hall.hall.gridRows);
  const width = cols * PITCH_X; const depth = rows * ROW_PITCH;
  const originX = -width / 2 + PITCH_X / 2; const originZ = -depth / 2 + ROW_PITCH / 2;
  const containment = hall.rows[0]?.containment ?? 'None';
  const unitHover = (e: PE, title: string, lines: string[]) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title, lines }); setHoverId(undefined); };
  const costPeerMax = useMemo(() => hall.racks.reduce((m, r) => Math.max(m, r.costUsd), 0), [hall.racks]);
  const ghostLabels = useMemo(() => ghostRackLabels(hall.racks), [hall.racks]);
  const beacons = useMemo<BeaconSpec[]>(() => hall.racks.flatMap((vm) => { const it = attention.racks.get(vm.rack.id); return it ? [{ key: vm.rack.id, position: [originX + vm.rack.gridX * PITCH_X, Math.max(0.2, vm.rack.heightU * U_HALL), originZ + vm.rack.gridY * ROW_PITCH] as [number, number, number], item: it, onClick: () => onDrill({ kind: 'rack', id: vm.rack.id }) }] : []; }), [hall.racks, attention, originX, originZ, onDrill]);
  const hallItem = attention.halls.get(hall.hall.id);
  return (
    <group>
      <Grid args={[width + 4, depth + 4]} cellSize={PITCH_X} sectionSize={ROW_PITCH} cellColor={p.grid} sectionColor={p.slateLight} fadeDistance={60} position={[0, -0.001, 0]} />
      {building && <FloorStack building={building} hallId={hall.hall.id} width={width} depth={depth} p={p} />}
      {Array.from({ length: rows + 1 }, (_, i) => {
        if (containment === 'None' && layer !== 'cooling') return null;
        const z = originZ - ROW_PITCH / 2 + i * ROW_PITCH; const cold = i % 2 === 0;
        return <mesh key={`aisle-${i}`} position={[0, 0.9, z]} raycast={noRaycast}><boxGeometry args={[width + 0.6, 1.8, ROW_PITCH - RACK_D - 0.1]} /><meshBasicMaterial color={cold ? p.cyan : p.amber} transparent opacity={layer === 'cooling' ? 0.14 : 0.06} depthWrite={false} /></mesh>;
      })}
      {hall.racks.map((vm) => <RackBox key={vm.rack.id} vm={vm} layer={layer} p={p} costPeerMax={costPeerMax} selected={selectedId === vm.rack.id} hovered={hoverId === vm.rack.id} onHover={(h, id) => { hover(h); setHoverId(id); }} onSelect={onSelect} onOpen={() => onDrill({ kind: 'rack', id: vm.rack.id })} x={originX + vm.rack.gridX * PITCH_X} z={originZ + vm.rack.gridY * ROW_PITCH} />)}
      {ghostLabels.map((g) => <Label key={g.key} position={[originX + g.gridX * PITCH_X, g.h + 0.25, originZ + g.gridY * ROW_PITCH]} text={g.text} sub={g.sub} size={10} />)}
      <Beacons items={beacons} p={p} size={0.13} stalk={0.45} hover={hover} />
      {hall.rows.map((r) => <Label key={r.id} position={[originX - PITCH_X * 1.2, 0.3, originZ + (+r.gridPosition) * ROW_PITCH]} text={r.name} />)}
      {hall.cracs.map((c, i) => {
        const x = originX + (i + 0.5) * (width / Math.max(1, hall.cracs.length)) - PITCH_X / 2;
        return (
          <group key={c.id} position={[x, 0, originZ - ROW_PITCH * 1.1]}>
            <mesh position={[0, 0.9, 0]} onPointerOver={(e: PE) => unitHover(e, `${c.name} · ${c.type}`, [`${c.status} · ${c.capacityKw} kW`, `supply ${c.supplyTempC} °C · return ${c.returnTempC} °C`])} onPointerOut={() => hover(null)}><boxGeometry args={[1.4, 1.8, 0.8]} /><meshStandardMaterial color={c.status === 'Failed' ? p.red : c.status === 'Operational' ? p.slate : p.amber} roughness={0.7} /><Edges color={p.slateDark} /></mesh>
            <Label position={[0, 2.3, 0]} text={c.name} sub={c.status} tone={c.status === 'Failed' ? 'error' : c.status === 'Operational' ? 'neutral' : 'warning'} />
          </group>
        );
      })}
      {hallItem && hallItem.reasons.some((r) => !r.includes('rack')) && <Beacons items={[{ key: `hall-${hall.hall.id}`, position: [originX - PITCH_X * 1.2, 2.0, originZ - ROW_PITCH * 1.1], item: hallItem }]} p={p} size={0.16} stalk={0.6} hover={hover} />}
      {hall.pdus.slice(0, 6).map((pd, i) => {
        const x = originX + (i + 0.5) * (width / Math.max(1, Math.min(6, hall.pdus.length))) - PITCH_X / 2;
        return <mesh key={pd.id} position={[x, 0.5, originZ + depth - ROW_PITCH * 0.15]} onPointerOver={(e: PE) => unitHover(e, pd.name, [`${pd.loadKw}/${pd.capacityKw} kW (${pd.loadPct}%)`, `${pd.outletsUsed}/${pd.outletCount} outlets used`])} onPointerOut={() => hover(null)}><boxGeometry args={[0.7, 1.0, 0.5]} /><meshStandardMaterial color={pd.loadPct >= 90 ? p.amber : p.slateDark} roughness={0.7} /><Edges color={p.ink} /></mesh>;
      })}
      {hall.pdus.length > 0 && <Label position={[0, 1.6, originZ + depth - ROW_PITCH * 0.15]} text="Floor PDUs" sub={`${hall.pdus.length} units`} />}
    </group>
  );
}

// ── Rack level: devices in their U positions ──
function RackScene({ vm, devices, p, hover, onOpenDevice, attention }: { vm: RackVm; devices: Device[]; p: VwPalette; hover: (h: Hover | null) => void; onOpenDevice?: (id: string) => void; attention: SiteAttention }) {
  const H = vm.rack.heightU * U_RACK; const W = 0.62; const D = 1.1;
  const placed = useMemo(() => devices.filter((d) => d.position && (d.heightU ?? 0) > 0 && !d.parentDeviceId), [devices]);
  const zeroU = useMemo(() => devices.filter((d) => (d.heightU ?? 0) === 0 && !d.parentDeviceId), [devices]);
  const labels = useMemo(() => deviceLabels(placed), [placed]);
  const item = attention.racks.get(vm.rack.id);
  const beacons = useMemo<BeaconSpec[]>(() => (item ? [{ key: vm.rack.id, position: [-W / 2 - 0.22, H, 0], item }] : []), [item, vm.rack.id, H]);
  return (
    <group position={[0, 0, 0]}>
      <Grid args={[8, 8]} cellSize={0.5} sectionSize={2} cellColor={p.grid} sectionColor={p.slateLight} fadeDistance={30} position={[0, -0.001, 0]} />
      <mesh position={[0, H / 2, 0]} raycast={noRaycast}><boxGeometry args={[W + 0.08, H + 0.04, D + 0.08]} /><meshBasicMaterial color={p.slateDark} transparent opacity={0.05} /><Edges color={p.slateDark} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * (W / 2 + 0.02), H / 2, D / 2 - 0.02]} raycast={noRaycast}><boxGeometry args={[0.04, H, 0.04]} /><meshStandardMaterial color={p.slateDark} /></mesh>)}
      {placed.map((d) => {
        const h = (d.heightU ?? 1) * U_RACK; const y = ((d.position ?? 1) - 1) * U_RACK + h / 2;
        const col = deviceColor(d, p); const ghost = isGhostDevice(d); const faded = ghost || d.status === 'Inactive';
        return (
          <mesh key={d.id} position={[0, y, 0]} onClick={(e) => { e.stopPropagation(); onOpenDevice?.(d.id); }} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: `${d.name} · U${d.position}${(d.heightU ?? 1) > 1 ? `–${(d.position ?? 1) + (d.heightU ?? 1) - 1}` : ''}${ghost ? ' · reserved' : ''}`, lines: [`${d.manufacturer ?? ''} ${d.model ?? ''} · ${d.category ?? ''}`, `${d.status} · ${d.lifecycleState ?? ''} · ${d.powerDrawW ?? 0} W${d.primaryIp4 ? ` · ${d.primaryIp4}` : ''}`, 'Click to open the device'] }); }} onPointerOut={() => hover(null)}>
            <boxGeometry args={[W - 0.04, h - 0.012, D - 0.1]} /><meshStandardMaterial color={ghost ? p.slateLight : col} roughness={0.5} metalness={0.15} transparent={faded} opacity={ghost ? 0.2 : d.status === 'Inactive' ? 0.45 : 1} depthWrite={!ghost} />
            {ghost ? <DashedBox args={[W - 0.04, h - 0.012, D - 0.1]} color={p.slate} dash={0.04} /> : <Edges color={p.ink} threshold={20} />}
            {!ghost && <mesh position={[0, 0, (D - 0.1) / 2 + 0.002]} raycast={noRaycast}><planeGeometry args={[W - 0.12, Math.max(0.01, h - 0.03)]} /><meshBasicMaterial color={p.ink} transparent opacity={0.12} /></mesh>}
          </mesh>
        );
      })}
      {zeroU.map((d, i) => <mesh key={d.id} position={[(i % 2 === 0 ? -1 : 1) * (W / 2 + 0.07), H * 0.45, -D / 2 + 0.25]} onPointerOver={(e: PE) => { e.stopPropagation(); hover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: d.name, lines: [`${d.model ?? ''} · zero-U · ${d.status}`] }); }} onPointerOut={() => hover(null)}><boxGeometry args={[0.07, H * 0.85, 0.08]} /><meshStandardMaterial color={deviceColor(d, p)} /><Edges color={p.ink} /></mesh>)}
      {labels.map((l) => <Label key={l.key} position={[W / 2 + 0.16, l.y, D / 2]} text={l.text} sub={l.sub} tone={l.tone} anchor="left" size={10} />)}
      {[1, 10, 20, 30, 40].filter((u) => u <= vm.rack.heightU).map((u) => <Label key={u} position={[-W / 2 - 0.45, (u - 0.5) * U_RACK, D / 2]} text={`U${u}`} />)}
      <Beacons items={beacons} p={p} size={0.07} stalk={0.3} hover={hover} />
      <Label position={[0, H + 0.45, 0]} text={vm.rack.name} sub={`${vm.rack.usedU}/${vm.rack.heightU} U · ${vm.rack.currentPowerKw} kW · ≈ ${fmtUsd(vm.costUsd)}/mo`} tone={attentionTone(item)} />
    </group>
  );
}

export function SiteTwin({ model, level, layer, view, palette: p, selectedRackId, onDrill, onSelectRack, onOpenDevice, height = 560, attention: attentionProp, focusHallId }: SiteTwinProps) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [hoverId, setHoverId] = useState<string | undefined>();
  const attention = useMemo(() => attentionProp ?? computeAttention(model), [attentionProp, model]);
  const building = level.kind === 'building' ? model.buildings.find((b) => b.building.id === level.id) : undefined;
  const hall = level.kind === 'hall' ? model.halls.find((h) => h.hall.id === level.id) : level.kind === 'rack' ? model.halls.find((h) => h.racks.some((r) => r.rack.id === level.id)) : undefined;
  const hallBuilding = hall ? model.buildings.find((b) => b.halls.some((h) => h.hall.id === hall.hall.id)) : undefined;
  const rackVm = level.kind === 'rack' ? model.rackById.get(level.id) : undefined;
  const bounds = useMemo(() => {
    if (level.kind === 'site') { const total = model.buildings.reduce((s, b) => s + Math.max(6, b.halls.length * 3.2) + 3, 0) + 12; return { w: total, d: 24, h: Math.max(FH, ...model.buildings.map((b) => b.floors.length * FH)) }; }
    if (level.kind === 'building' && building) return { w: Math.max(8, Math.max(1, ...building.floors.map((f) => f.halls.length)) * 4.2) + 4, d: 8, h: building.floors.length * FH + 1 };
    if (level.kind === 'hall' && hall) return { w: Math.max(1, hall.hall.gridCols) * PITCH_X, d: Math.max(1, hall.hall.gridRows) * ROW_PITCH + 3, h: FH };
    if (level.kind === 'rack' && rackVm) return { w: 2.2, d: 2.2, h: rackVm.rack.heightU * U_RACK };
    return { w: 20, d: 20, h: 2 };
  }, [level, model.buildings, building, hall, rackVm]);
  const preset = useMemo(() => presetFor(level.kind, view, bounds.w, bounds.d, bounds.h), [level.kind, view, bounds]);
  // Canvas root props must stay referentially stable or the renderer reconfigures.
  const gl = useMemo(() => ({ preserveDrawingBuffer: true, antialias: true }), []);
  const dpr = useMemo(() => [1, 2] as [number, number], []);
  const camera = useMemo(() => ({ position: [30, 24, 36] as [number, number, number], fov: 34, near: 0.1, far: 800 }), []);
  const onHover = (h: Hover | null) => setHover(h);
  return (
    <div style={{ position: 'relative', height, borderRadius: 'var(--vw-radius-md, 12px)', overflow: 'hidden', background: `linear-gradient(180deg, ${p.surface}, #ffffff)` }}>
      <Canvas camera={camera} gl={gl} dpr={dpr} onPointerMissed={() => onSelectRack(undefined)}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 14, 6]} intensity={1.1} />
        <directionalLight position={[-6, 8, -4]} intensity={0.35} />
        {level.kind === 'site' && <SiteScene model={model} layer={layer} p={p} onDrill={onDrill} hover={onHover} attention={attention} />}
        {level.kind === 'building' && building && <BuildingScene b={building} model={model} layer={layer} p={p} onDrill={onDrill} hover={onHover} attention={attention} focusHallId={focusHallId} />}
        {level.kind === 'hall' && hall && <HallScene hall={hall} building={hallBuilding} layer={layer} p={p} selectedId={selectedRackId} onSelect={onSelectRack} onDrill={onDrill} hover={onHover} setHoverId={setHoverId} hoverId={hoverId} attention={attention} />}
        {level.kind === 'rack' && rackVm && <RackScene vm={rackVm} devices={model.devicesByRack.get(rackVm.rack.id) ?? []} p={p} hover={onHover} onOpenDevice={onOpenDevice} attention={attention} />}
        <OrbitControls makeDefault enablePan maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={200} />
        <CameraRig pos={preset.pos} target={preset.target} />
      </Canvas>
      {hover && (
        <div className="vw-card-child" style={{ position: 'absolute', left: hover.x + 14, top: Math.max(8, hover.y - 70), padding: '6px 10px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(15,23,42,0.15)' }}>
          <div className="vw-card-title-sm">{hover.title}</div>
          {hover.lines.map((l) => <div key={l} className="vw-card-description">{l}</div>)}
        </div>
      )}
      <div className="vw-card-description" style={{ position: 'absolute', right: 10, bottom: 8, pointerEvents: 'none' }}>drag to orbit · scroll to zoom · click to drill{attention.items.length ? ` · ${attention.counts.critical} critical / ${attention.counts.major} major beacons` : ''}</div>
    </div>
  );
}
