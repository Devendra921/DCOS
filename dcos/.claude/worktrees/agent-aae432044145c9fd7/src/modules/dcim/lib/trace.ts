import type { Device, DeviceComponent, Cable } from '../../../mock/data/types';

export interface TraceHop {
  deviceId: string;
  deviceName: string;
  component: string;
  kind: string;
  via?: 'cable' | 'pass-through';
  cableType?: string;
}
export interface TraceCtx { devices: Device[]; components: DeviceComponent[]; cables: Cable[]; }

const isPass = (k: string) => k === 'front-port' || k === 'rear-port';
const numSuffix = (s: string) => s.match(/(\d+)$/)?.[1];

/** Walk the physical path from a port, hopping across patch-panel (front/rear) ports
 *  until a non-pass-through or unconnected endpoint — NetBox-style cable trace. */
export function traceFrom(startId: string, ctx: TraceCtx): TraceHop[] {
  const compById = new Map(ctx.components.map((c) => [c.id, c]));
  const devName = (id: string) => ctx.devices.find((d) => d.id === id)?.name ?? '?';
  const hop = (c: DeviceComponent, via?: TraceHop['via'], cableType?: string): TraceHop =>
    ({ deviceId: c.deviceId, deviceName: devName(c.deviceId), component: c.name, kind: c.kind, via, cableType });

  const start = compById.get(startId);
  if (!start) return [];
  const path: TraceHop[] = [hop(start)];
  const visited = new Set<string>([startId]);
  let current = start;
  let guard = 0;
  while (guard++ < 100) {
    const cable = ctx.cables.find((cb) =>
      (cb.aComponentId === current.id && !visited.has(cb.bComponentId)) ||
      (cb.bComponentId === current.id && !visited.has(cb.aComponentId)));
    if (!cable) break;
    const farId = cable.aComponentId === current.id ? cable.bComponentId : cable.aComponentId;
    const far = compById.get(farId);
    if (!far) break;
    visited.add(farId);
    path.push(hop(far, 'cable', cable.cableType));
    if (isPass(far.kind)) {
      // Prefer the explicit front↔rear mapping; fall back to index-matching.
      let sib: DeviceComponent | undefined;
      if (far.kind === 'front-port' && far.rearPortId) {
        sib = compById.get(far.rearPortId);
      } else if (far.kind === 'rear-port') {
        sib = ctx.components.find((c) => c.kind === 'front-port' && c.rearPortId === far.id);
      }
      if (!sib || visited.has(sib.id)) {
        const n = numSuffix(far.name);
        sib = ctx.components.find((c) =>
          c.deviceId === far.deviceId && isPass(c.kind) && c.kind !== far.kind && numSuffix(c.name) === n && !visited.has(c.id));
      }
      if (!sib || visited.has(sib.id)) break;
      visited.add(sib.id);
      path.push(hop(sib, 'pass-through'));
      current = sib;
      continue;
    }
    break; // real endpoint reached
  }
  return path;
}

/** Expand a name pattern like `xe-0/0/[1-48]` into individual component names. */
export function expandNames(pattern: string): string[] {
  const m = pattern.match(/^(.*)\[(\d+)-(\d+)\](.*)$/);
  if (!m) return [pattern];
  const [, pre, a, b, post] = m;
  const out: string[] = [];
  for (let i = +a; i <= +b; i++) out.push(`${pre}${i}${post}`);
  return out;
}
