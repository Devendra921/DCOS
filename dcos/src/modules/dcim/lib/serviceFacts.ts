/* Commercial estate facts read from the DCOS records for the operations cockpit's service and
   customer screens: the racks and GPU nodes a service occupies, its start date and currency, and
   the racks each customer leases. Ids are shared with the cockpit (service, customer, rack and
   device ids are the DCOS ids). */
import { useMemo } from 'react';
import type { Customer, DataCenter, Device, Hall, Rack, Service } from '../../../mock/data/types';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { tenantRacksByCustomer, type TenantRacks } from '../../facility/lib/estateRules';
import { isGpuService, racksOfService } from './estateView';

export interface ServiceFacts {
  rackIds: string[]; startDate?: string; currency: string;
  /** GPU servers on the service's path or in its racks. */
  gpuNodes: Device[]; gpus: number;
}
const FALLBACK = 'USD';

/** Per-service footprint and commercial facts, keyed by service id. */
export function useServiceFacts(): Map<string, ServiceFacts> {
  const services = (useEntityList('services', { pageSize: 20000 }).data?.data ?? []) as unknown as Service[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  return useMemo(() => {
    const gpuById = new Map<string, Device>(), gpuByRack = new Map<string, Device[]>();
    for (const d of devices) {
      if (!d.gpu) continue;
      gpuById.set(d.id, d);
      if (d.rackId) gpuByRack.set(d.rackId, [...(gpuByRack.get(d.rackId) ?? []), d]);
    }
    const m = new Map<string, ServiceFacts>();
    for (const s of services) {
      const rackIds = racksOfService(s);
      const nodes = new Map<string, Device>();
      for (const id of [s.deviceId, ...(s.pathDeviceIds ?? [])]) { const d = id ? gpuById.get(id) : undefined; if (d) nodes.set(d.id, d); }
      /* a GPU service sold by the rack occupies every GPU server in those racks */
      if (isGpuService(s)) for (const r of rackIds) for (const d of gpuByRack.get(r) ?? []) nodes.set(d.id, d);
      const gpuNodes = [...nodes.values()];
      m.set(s.id, { rackIds, startDate: s.startDate, currency: s.currency ?? FALLBACK, gpuNodes, gpus: gpuNodes.reduce((a, d) => a + (d.gpu?.count ?? 0), 0) });
    }
    return m;
  }, [services, devices]);
}

/** The currency a customer is billed in: the one its services share, else the fallback. */
export function currencyOf(serviceIds: string[], facts: Map<string, ServiceFacts>): string {
  const cur = new Set(serviceIds.map((id) => facts.get(id)?.currency).filter((c): c is string => !!c));
  return cur.size === 1 ? [...cur][0] : FALLBACK;
}

/** Leased racks per customer across every site. */
export function useTenancy(): Map<string, TenantRacks> {
  const racks = (useEntityList('racks', { pageSize: 20000 }).data?.data ?? []) as unknown as Rack[];
  const customers = (useEntityList('customers', { pageSize: 5000 }).data?.data ?? []) as unknown as Customer[];
  return useMemo(() => new Map(tenantRacksByCustomer(racks, customers).map((t) => [t.customerId, t])), [racks, customers]);
}

export function usePlaceNames() {
  const racks = (useEntityList('racks', { pageSize: 20000 }).data?.data ?? []) as unknown as Rack[];
  const sites = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const halls = (useEntityList('halls', { pageSize: 5000 }).data?.data ?? []) as unknown as Hall[];
  return useMemo(() => ({
    rack: new Map(racks.map((r) => [r.id, r])),
    site: new Map(sites.map((s) => [s.id, s.name])),
    hall: new Map(halls.map((h) => [h.id, h.name])),
  }), [racks, sites, halls]);
}
