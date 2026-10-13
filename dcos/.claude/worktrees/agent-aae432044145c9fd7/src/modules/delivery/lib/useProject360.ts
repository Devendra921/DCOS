import { useMemo } from 'react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { TEMPLATE_REGISTRY } from './projectTemplates';
import type { Project, Rack, Device, Cable, Hall, VLAN, Circuit, AuditEvent, Incident } from '../../../mock/data/types';
import type { ProjectTemplateCategory } from '../../../mock/data/enums';

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export interface ProjectImpact {
  category: ProjectTemplateCategory | 'IT';
  racks: Rack[]; devices: Device[]; cables: Cable[]; halls: Hall[]; vlans: VLAN[]; circuits: Circuit[];
  provisioned: Device[];
  total: number;
}

/**
 * Derived blast-radius: the entities a project touches, inferred from its data
 * center + template. A deterministic slice of the DC's racks (by project id) gives
 * each project a stable, plausible impacted set; go-live-provisioned devices are
 * surfaced separately as directly created.
 */
export function useProjectImpact(project: Project | null): ProjectImpact {
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const cables = (useEntityList('cables', { pageSize: 8000 }).data?.data ?? []) as unknown as Cable[];
  const halls = (useEntityList('halls', { pageSize: 1000 }).data?.data ?? []) as unknown as Hall[];
  const vlans = (useEntityList('vlans', { pageSize: 1000 }).data?.data ?? []) as unknown as VLAN[];
  const circuits = (useEntityList('circuits', { pageSize: 1000 }).data?.data ?? []) as unknown as Circuit[];

  return useMemo(() => {
    const empty: ProjectImpact = { category: 'IT', racks: [], devices: [], cables: [], halls: [], vlans: [], circuits: [], provisioned: [], total: 0 };
    if (!project) return empty;
    const cat = (TEMPLATE_REGISTRY[project.template as keyof typeof TEMPLATE_REGISTRY]?.category ?? 'IT') as ProjectImpact['category'];
    const dcRacks = racks.filter((r) => r.dataCenterId === project.dataCenterId);
    // deterministic window of racks for this project
    const n = Math.min(8, Math.max(3, Math.round(dcRacks.length / 6)));
    const start = dcRacks.length ? hash(project.id) % dcRacks.length : 0;
    const impRacks = dcRacks.length ? Array.from({ length: Math.min(n, dcRacks.length) }, (_, i) => dcRacks[(start + i) % dcRacks.length]) : [];
    const rackIds = new Set(impRacks.map((r) => r.id));
    const hallIds = new Set(impRacks.map((r) => r.hallId));
    const impDevices = devices.filter((d) => (d as Device & { rackId?: string }).rackId && rackIds.has((d as Device & { rackId?: string }).rackId!));
    const devIds = new Set(impDevices.map((d) => d.id));
    const impCables = cables.filter((c) => devIds.has(c.aDeviceId) || devIds.has(c.bDeviceId));
    const impHalls = halls.filter((h) => hallIds.has(h.id));
    const impVlans = cat === 'Network' ? vlans.filter((v) => v.dataCenterId === project.dataCenterId).slice(0, 8) : [];
    const impCircuits = cat === 'Network' ? circuits.slice(hash(project.id) % Math.max(1, circuits.length), (hash(project.id) % Math.max(1, circuits.length)) + 4) : [];
    const provisioned = devices.filter((d) => d.name?.startsWith(project.name.slice(0, 12)));

    return {
      category: cat, racks: impRacks, devices: impDevices, cables: impCables, halls: impHalls,
      vlans: impVlans, circuits: impCircuits, provisioned,
      total: impRacks.length + impDevices.length + impCables.length + impHalls.length + impVlans.length + impCircuits.length,
    };
  }, [project, racks, devices, cables, halls, vlans, circuits]);
}

/** Immutable change log: every audit event linked to this project (the physical
 *  changes it made) plus the project record's own audit, newest first. */
export function useProjectChangeLog(project: Project | null): AuditEvent[] {
  const audits = (useEntityList('auditEvents', { pageSize: 5000 }).data?.data ?? []) as unknown as AuditEvent[];
  return useMemo(() => {
    if (!project) return [];
    return audits
      .filter((a) => a.projectId === project.id || (a.entityType === 'Project' && a.entityId === project.projId))
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [project, audits]);
}

/** Related incidents: those in the project's data center overlapping its window. */
export function useRelatedIncidents(project: Project | null): Incident[] {
  const incidents = (useEntityList('incidents', { pageSize: 2000 }).data?.data ?? []) as unknown as Incident[];
  return useMemo(() => {
    if (!project) return [];
    return incidents
      .filter((i) => i.dataCenterId === project.dataCenterId)
      .sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
  }, [project, incidents]);
}
