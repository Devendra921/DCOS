/**
 * One data centre's estate records — rooms, racks, power plant, cooling, sensors, monitoring
 * sources and GPU clusters — loaded once and indexed for the facility screens.
 * Pass no dcId to load the whole estate (or a DC-scope filter for scoped pages).
 */
import { useMemo } from 'react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { FilterCriteria } from '../../../mock/db/store';
import type {
  Hall, Rack, Device, UtilityFeed, UPS, Generator, DcPlant, CoolingZone, CRAC, Cdu, EnvSensor, Collector, GpuCluster, Customer, PowerFeed,
} from '../../../mock/data/types';

import { cduLoad, type CduLoad } from './estateRules';

const list = <T,>(q: { data?: { data?: unknown[] } }) => (q.data?.data ?? []) as unknown as T[];

/** A CDU with the racks it serves and its live liquid load (estateRules.cduLoad). */
export type CduVm = CduLoad;

export interface SiteEstate {
  halls: Hall[]; racks: Rack[]; devices: Device[];
  feeds: UtilityFeed[]; ups: UPS[]; generators: Generator[]; dcPlants: DcPlant[];
  zones: CoolingZone[]; cracs: CRAC[]; cdus: CduVm[]; sensors: EnvSensor[]; collectors: Collector[]; clusters: GpuCluster[];
  customers: Map<string, Customer>; hallById: Map<string, Hall>; cduById: Map<string, CduVm>;
  /** Utility feed or rack power feed by id (Rack.feedAId / feedBId point at either). */
  feedById: Map<string, { name: string; kind: 'utility' | 'rack'; href?: string; detail: string }>;
  /** Devices each collector polls. */
  polledBy: Map<string, number>;
  itKw: number;
}

export function useSiteEstate(scope: { dcId?: string; filters?: FilterCriteria[]; withDevices?: boolean } = {}): SiteEstate {
  const f: FilterCriteria[] = scope.dcId ? [{ field: 'dataCenterId', operator: 'eq', value: scope.dcId }] : scope.filters ?? [];
  const halls = list<Hall>(useEntityList('halls', { pageSize: 2000, filters: f }));
  const racks = list<Rack>(useEntityList('racks', { pageSize: 10000, filters: f }));
  const devices = list<Device>(useEntityList(scope.withDevices === false ? '__noop__' : 'devices', { pageSize: 20000, filters: f }));
  const feeds = list<UtilityFeed>(useEntityList('utilityFeeds', { pageSize: 500, filters: f }));
  const ups = list<UPS>(useEntityList('upsUnits', { pageSize: 500, filters: f }));
  const generators = list<Generator>(useEntityList('generators', { pageSize: 500, filters: f }));
  const dcPlants = list<DcPlant>(useEntityList('dcPlants', { pageSize: 1000, filters: f }));
  const zones = list<CoolingZone>(useEntityList('coolingZones', { pageSize: 2000, filters: f }));
  const cracsAll = list<CRAC>(useEntityList('cracUnits', { pageSize: 5000 }));
  const cdusRaw = list<Cdu>(useEntityList('cdus', { pageSize: 2000, filters: f }));
  const sensors = list<EnvSensor>(useEntityList('envSensors', { pageSize: 10000, filters: f }));
  const collectors = list<Collector>(useEntityList('collectors', { pageSize: 1000, filters: f }));
  const clusters = list<GpuCluster>(useEntityList('gpuClusters', { pageSize: 500, filters: f }));
  const customersAll = list<Customer>(useEntityList('customers', { pageSize: 2000 }));
  const rackFeeds = list<PowerFeed>(useEntityList('powerFeeds', { pageSize: 10000 }));

  return useMemo(() => {
    const zoneIds = new Set(zones.map((z) => z.id));
    const cracs = cracsAll.filter((c) => zoneIds.has(c.coolingZoneId));
    const cdus: CduVm[] = cdusRaw.map((cdu) => cduLoad(cdu, racks));
    const feedById: SiteEstate['feedById'] = new Map();
    for (const u of feeds) feedById.set(u.id, { name: u.name, kind: 'utility', detail: [u.supply ?? 'AC', u.ratingText ?? `${u.voltage} V`, `${u.capacityKw} kW`].join(' · ') });
    for (const p of rackFeeds) feedById.set(p.id, { name: p.name, kind: 'rack', href: '/facility/power-dist', detail: `${p.supply} · ${p.voltage} V · ${p.amperage} A · ${p.status}` });
    const polledBy = new Map<string, number>();
    for (const d of devices) if (d.collectorId) polledBy.set(d.collectorId, (polledBy.get(d.collectorId) ?? 0) + 1);
    return {
      halls, racks, devices, feeds, ups, generators, dcPlants, zones, cracs, cdus, sensors, collectors, clusters,
      customers: new Map(customersAll.map((c) => [c.id, c])), hallById: new Map(halls.map((h) => [h.id, h])), cduById: new Map(cdus.map((c) => [c.cdu.id, c])),
      feedById, polledBy, itKw: Math.round(racks.reduce((s, r) => s + r.currentPowerKw, 0)),
    };
  }, [halls, racks, devices, feeds, ups, generators, dcPlants, zones, cracsAll, cdusRaw, sensors, collectors, clusters, customersAll, rackFeeds]);
}
