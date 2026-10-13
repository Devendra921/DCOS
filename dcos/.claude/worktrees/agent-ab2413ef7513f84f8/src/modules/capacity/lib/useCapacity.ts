import { useMemo } from 'react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { decodeDetail } from '../../planning/lib/planExec';
import type { Device, Rack, CoolingZone, ComputeResource, CapacityReservation, RackReservation, Plan } from '../../../mock/data/types';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const num = (v: unknown) => Number(v) || 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A device counts toward live load only if it's installed in a rack and operational. */
export function isLiveInRack(d: Device): boolean {
  return !!d.rackId && d.position != null
    && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed'
    && d.status !== 'Inactive';
}

export interface ResourceCapacity {
  used: number; max: number; reserved: number; pipeline: number;
  util: number; headroom: number; availableNet: number;
}
export interface CapacityModel {
  power: ResourceCapacity; cooling: ResourceCapacity; space: ResourceCapacity; gpu: ResourceCapacity;
  perRack: Record<string, { usedKw: number; usedU: number; utilPct: number }>;
}

function res(used: number, max: number, reserved: number, pipeline: number): ResourceCapacity {
  const m = max || 0;
  return {
    used: r1(used), max: r1(m), reserved: r1(reserved), pipeline: r1(pipeline),
    util: m > 0 ? Math.round((used / m) * 100) : 0,
    headroom: r1(m - used),
    availableNet: r1(m - used - reserved - pipeline),
  };
}

/** Pure: derive the whole capacity picture from the live estate. */
export function computeCapacity(input: {
  devices: Device[]; racks: Rack[]; zones: CoolingZone[]; comp: ComputeResource[];
  capRes: CapacityReservation[]; rackRes: RackReservation[]; plans: Plan[];
}): CapacityModel {
  const { devices, racks, zones, comp, capRes, rackRes, plans } = input;
  const rackIds = new Set(racks.map((r) => r.id));
  const rackById = new Map(racks.map((r) => [r.id, r]));

  // live per-rack usage from active devices
  const perRack: Record<string, { usedKw: number; usedU: number; utilPct: number }> = {};
  for (const r of racks) perRack[r.id] = { usedKw: 0, usedU: 0, utilPct: 0 };
  for (const d of devices) {
    if (!isLiveInRack(d) || !perRack[d.rackId!]) continue;
    perRack[d.rackId!].usedKw += (d.powerDrawW ?? 0) / 1000;
    perRack[d.rackId!].usedU += d.heightU ?? 1;
  }
  for (const r of racks) {
    const pr = perRack[r.id];
    pr.usedU = Math.min(r.heightU, pr.usedU);
    pr.utilPct = r.maxPowerKw > 0 ? Math.round((pr.usedKw / r.maxPowerKw) * 100) : 0;
  }

  const usedPower = sum(racks.map((r) => perRack[r.id].usedKw));
  const maxPower = sum(racks.map((r) => r.maxPowerKw));
  const usedU = sum(racks.map((r) => perRack[r.id].usedU));
  const maxU = sum(racks.map((r) => r.heightU));

  // reservations scoped to the racks in view
  const liveRes = capRes.filter((x) => ['Reserved', 'Committed'].includes(x.state) && (x.resourceType !== 'Rack' || rackIds.has(x.resourceId)));
  const reservedKw = sum(liveRes.filter((x) => (x.unit || '').toLowerCase().includes('kw')).map((x) => x.quantity));
  const reservedU = sum(liveRes.filter((x) => (x.unit || '').toLowerCase() === 'u').map((x) => x.quantity))
    + sum(rackRes.filter((rr) => rr.status === 'Active' && rackIds.has(rr.rackId)).map((rr) => rr.units?.length ?? 0));

  // committed pipeline from approved/executing Capacity Expansion / New Rollout plans
  const pipe = plans.filter((p) => ['Approved', 'Executing'].includes(p.status));
  const pipePower = sum(pipe.filter((p) => p.type === 'Capacity Expansion').map((p) => num(decodeDetail(p.detail).powerKw)));
  const pipeCooling = sum(pipe.filter((p) => p.type === 'Capacity Expansion').map((p) => num(decodeDetail(p.detail).coolingKw)));
  const pipeGpu = sum(pipe.filter((p) => p.type === 'Capacity Expansion').map((p) => num(decodeDetail(p.detail).quantity)));
  const pipeU = sum(pipe.filter((p) => p.type === 'New Rollout').map((p) => num(decodeDetail(p.detail).rackCount) * 42));

  const coolMax = sum(zones.map((z) => z.coolingCapacityKw));
  const coolUsed = usedPower * 1.1; // cooling tracks live IT load
  const gpuMax = sum(comp.map((c) => c.gpuCountTotal));
  const gpuUsed = sum(comp.map((c) => c.gpuCountUsed));

  return {
    power: res(usedPower, maxPower, reservedKw, pipePower),
    cooling: res(coolUsed, coolMax, 0, pipeCooling),
    space: res(usedU, maxU, reservedU, pipeU),
    gpu: res(gpuUsed, gpuMax, 0, pipeGpu),
    perRack,
  };
}

/** DC-scoped live capacity model shared by every capacity surface. */
export function useCapacity(): CapacityModel {
  const dcF = useDcFilter();
  const dcFScope = useDcFilter('scopeId');
  const devices = (useEntityList('devices', { pageSize: 20000, filters: dcF }).data?.data ?? []) as unknown as Device[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];
  const comp = (useEntityList('computeResources', { pageSize: 400, filters: dcFScope }).data?.data ?? []) as unknown as ComputeResource[];
  const capRes = (useEntityList('capacityReservations', { pageSize: 1000 }).data?.data ?? []) as unknown as CapacityReservation[];
  const rackRes = (useEntityList('rackReservations', { pageSize: 1000 }).data?.data ?? []) as unknown as RackReservation[];
  const plans = (useEntityList('plans', { pageSize: 1000, filters: dcF }).data?.data ?? []) as unknown as Plan[];
  return useMemo(() => computeCapacity({ devices, racks, zones, comp, capRes, rackRes, plans }), [devices, racks, zones, comp, capRes, rackRes, plans]);
}
