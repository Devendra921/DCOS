import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Modal, Form, Input, Select, DatePicker } from 'antd';
import {
  Activity, ArrowLeftRight, Building, Cable, ChartLine, ChevronRight, CircleCheck, Flame, FolderKanban, Gauge, GitBranch,
  HeartPulse, Leaf, Lightbulb, ListTodo, Network, Radar, Siren, Sparkles, TrendingUp, TriangleAlert, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEntityList, useEntityCreate } from '../shared/hooks/useEntityCRUD';
import { CHANGE_TYPE, RISK_LEVEL, SEVERITY } from '../mock/data/enums';
import { useDcScope, useDcFilter, PageDcScopeSelect } from '../core/scope/DcScope';
import { bucketSum } from '../shared/kpi/timeSeries';
import { dcTypeName, capacityThresholds } from '../mock/data/dcTypes';
import './mission-control.css';
import { OpsPage } from '../shared/components/ops/OpsPage';
import { ViewSwitcher } from '../shared/components/ux/ViewSwitcher';
import { Btn, Chip, Empty, KV, Panel, PanelLink } from '../ops/ui/kit';
import { DataTable, type Col } from '../ops/ui/DataTable';
import { Meter } from '../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../ops/ui/Analytics';
import { BarList } from '../ops/charts/BarList';
import { TimeChart } from '../ops/charts/TimeChart';
import { incidentStats, fmtDuration, SLA_TARGETS } from '../modules/operations/lib/sla';
import { alarmStats } from '../modules/nms/lib/fault';
import { fleetHealth, healthColor } from '../modules/nms/lib/health';
import { configFleet } from '../modules/nms/lib/config';
import { computePortfolioEarnedValue } from '../modules/delivery/lib/cost';
import { circuitStats, siteRedundancy, fmtMoney } from '../modules/circuits/lib/circuits';
import { systemHealth, capacityRunway, detectAnomalies, healthBandColor, runwayColor, anomalyColor, type Anomaly } from '../shared/intel/intelligence';
import type {
  Rack, CoolingZone, ComputeResource, Alarm, Incident, ChangeRequest, Subnet,
  ManagedDevice, RiskItem, Plan, PurchaseOrder, Project, Atp, AuditEvent, DataCenter, Device,
  Interface, BOM, ChangeOrder, Circuit, CircuitTermination, MaintenanceWindow,
} from '../mock/data/types';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const pct = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);
const idxColor = (v: number) => v >= 1 ? 'var(--vw-color-green-600)' : v >= 0.9 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
const pueColor = (v: number) => v <= 1.4 ? 'var(--vw-color-green-600)' : v <= 1.6 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
const SEV_TO_PRI = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' } as const;
const Num = ({ v, color }: { v: React.ReactNode; color?: string }) => <span className="num" style={color ? { color } : undefined}>{v}</span>;
function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="row between mc-row"><span className="muted">{label}</span><b className="num strong">{value}</b></div>;
}

export default function MissionControl() {
  const navigate = useNavigate();
  const { dcId } = useDcScope();
  const dcF = useDcFilter();
  const dcFScope = useDcFilter('scopeId');

  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 200, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];
  const comp = (useEntityList('computeResources', { pageSize: 200, filters: dcFScope }).data?.data ?? []) as unknown as ComputeResource[];
  const subnets = (useEntityList('subnets', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as Subnet[];
  const changes = (useEntityList('changeRequests', { pageSize: 500, filters: dcF }).data?.data ?? []) as unknown as ChangeRequest[];
  const managed = (useEntityList('managedDevices', { pageSize: 5000, filters: dcF }).data?.data ?? []) as unknown as ManagedDevice[];
  const projects = (useEntityList('projects', { pageSize: 300, filters: dcF }).data?.data ?? []) as unknown as Project[];
  const atps = (useEntityList('atps', { pageSize: 1000 }).data?.data ?? []) as unknown as Atp[];
  const alarms = (useEntityList('alarms', { pageSize: 2000 }).data?.data ?? []) as unknown as Alarm[];
  const incidents = (useEntityList('incidents', { pageSize: 300 }).data?.data ?? []) as unknown as Incident[];
  const risks = (useEntityList('risks', { pageSize: 1000 }).data?.data ?? []) as unknown as RiskItem[];
  const plans = (useEntityList('plans', { pageSize: 500 }).data?.data ?? []) as unknown as Plan[];
  const pos = (useEntityList('purchaseOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as PurchaseOrder[];
  const boms = (useEntityList('boms', { pageSize: 2000 }).data?.data ?? []) as unknown as BOM[];
  const changeOrders = (useEntityList('changeOrders', { pageSize: 2000 }).data?.data ?? []) as unknown as ChangeOrder[];
  const circuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const cterms = (useEntityList('circuitTerminations', { pageSize: 5000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const maint = (useEntityList('maintenanceWindows', { pageSize: 500 }).data?.data ?? []) as unknown as MaintenanceWindow[];
  const interfaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const audit = (useEntityList('auditEvents', { pageSize: 500 }).data?.data ?? []) as unknown as AuditEvent[];
  const assets = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];

  const { message } = App.useApp();
  const createCR = useEntityCreate('changeRequests');
  const createInc = useEntityCreate('incidents');
  const createMw = useEntityCreate('maintenanceWindows');
  const [qa, setQa] = useState<null | 'change' | 'incident' | 'maint'>(null);
  const [qaForm] = Form.useForm();
  const openQa = (k: 'change' | 'incident' | 'maint') => { qaForm.resetFields(); setQa(k); };
  const submitQa = async () => {
    const v = await qaForm.validateFields();
    const now = new Date().toISOString();
    if (qa === 'change') {
      createCR.mutate({ chgId: `CHG-QA-${Date.now().toString().slice(-4)}`, title: v.title, type: v.type, description: 'Raised from the Command Center.', risk: v.risk, status: 'Submitted', priority: 'Medium', affectedResourceType: 'Asset', affectedResourceIds: [], requestedBy: 'You', requestedById: 'me', policyViolations: [], customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
        { onSuccess: (r: Record<string, unknown>) => { setQa(null); message.success('Change submitted for review'); navigate(`/change/${r.id as string}`); } });
    } else if (qa === 'incident') {
      const sev = v.severity as keyof typeof SLA_TARGETS; const t = SLA_TARGETS[sev];
      createInc.mutate({ incId: `INC-QA-${Date.now().toString().slice(-4)}`, title: v.title, type: v.type, severity: sev, status: 'Open', priority: SEV_TO_PRI[sev], affectedResourceType: 'Rack', affectedResourceIds: [], detectedAt: now, slaResponseMins: t.responseMins, slaResolveMins: t.resolveMins, reportedBy: 'You', worklog: [{ at: now, author: 'You', kind: 'StatusChange', text: 'Logged from the Command Center.' }], customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
        { onSuccess: (r: Record<string, unknown>) => { setQa(null); message.success('Incident logged'); navigate(`/incidents/${r.id as string}`); } });
    } else if (qa === 'maint') {
      const start = v.window?.[0]?.toISOString?.() ?? now; const end = v.window?.[1]?.toISOString?.() ?? now;
      createMw.mutate({ mwId: `MW-QA-${Date.now().toString().slice(-4)}`, title: v.title, status: 'Scheduled', dataCenterId: v.dataCenterId, scheduledStart: start, scheduledEnd: end, impact: v.impact ?? 'No customer impact', owner: 'You', customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' },
        { onSuccess: () => { setQa(null); message.success('Maintenance window scheduled'); } });
    }
  };

  const m = useMemo(() => {
    const ifByDevice = new Map<string, Interface[]>();
    const ifById = new Map<string, Interface>();
    for (const i of interfaces) { ifById.set(i.id, i); const a = ifByDevice.get(i.deviceId) ?? []; a.push(i); ifByDevice.set(i.deviceId, a); }
    const powCur = sum(racks.map((r) => r.currentPowerKw)), powMax = sum(racks.map((r) => r.maxPowerKw));
    const gpuU = sum(comp.map((c) => c.gpuCountUsed)), gpuT = sum(comp.map((c) => c.gpuCountTotal));
    const coolLoad = sum(zones.map((z) => z.currentLoadKw)), coolCap = sum(zones.map((z) => z.coolingCapacityKw));

    const istats = incidentStats(incidents);
    const astats = alarmStats(alarms);
    const fleet = configFleet(managed, ifByDevice);
    const health = fleetHealth(managed, alarms, ifByDevice, fleet.rows);
    const ev = computePortfolioEarnedValue(projects, boms, pos, changeOrders);
    const cstats = circuitStats(circuits, cterms, ifById);
    const exposed = siteRedundancy(circuits, cterms, dcs).filter((s) => s.exposed);
    const activeByDev = new Set(alarms.filter((a) => a.state === 'Active').map((a) => a.deviceId));
    const healthByDc = new Map<string, number[]>();
    for (const r of health.rows) { const a = healthByDc.get(r.device.dataCenterId ?? '') ?? []; a.push(r.score); healthByDc.set(r.device.dataCenterId ?? '', a); }

    // ── Intelligence layer ──
    const devName = Object.fromEntries(managed.map((d) => [d.id, d.hostname]));
    const days = 14, dayMs = 864e5, aStart = Date.now() - (days - 1) * dayMs;
    const alarmDaily = new Array(days).fill(0);
    for (const a of alarms) { const idx = Math.floor((new Date(a.raisedAt).getTime() - aStart) / dayMs); if (idx >= 0 && idx < days) alarmDaily[idx]++; }
    const aTermBy = new Map<string, CircuitTermination>(); for (const t of cterms) if (t.side === 'A') aTermBy.set(t.circuitId, t);
    const saturatedCircuits = circuits.filter((c) => c.status === 'Active').map((c) => { const t = aTermBy.get(c.id); const iface = t?.interfaceId ? ifById.get(t.interfaceId) : undefined; return { c, util: iface ? iface.utilizationPct : 0 }; }).filter((x) => x.util >= 90).map((x) => ({ cid: x.c.cid, id: x.c.id }));
    const powUtil = pct(powCur, powMax);
    const system = systemHealth({ netHealth: health.avg, slaCompliancePct: istats.slaCompliancePct, breaching: istats.breaching, powUtilPct: powUtil, spi: ev.spi, cpi: ev.cpi, compliancePct: fleet.meanCompliancePct, offlineCircuits: cstats.offline, exposedSites: exposed.length });
    const anomalies = detectAnomalies({ ifaces: interfaces, devName, healthRows: health.rows, alarmDaily, spi: ev.spi, cpi: ev.cpi, eac: ev.eac, bac: ev.bac, saturatedCircuits, driftSpike: fleet.withDrift });

    // ── Executive scorecard: efficiency, cost & resilience ──
    const itKw = powCur, coolKw = coolLoad;
    // Facility electrical draw = IT + cooling-system power (heat removed ÷ CoP≈3) + UPS/PDU/lighting losses.
    const totalKw = itKw + coolKw * 0.3 + itKw * 0.07;
    const pue = itKw > 0 ? Math.round((totalKw / itKw) * 100) / 100 : 0;
    const monthlyKwh = totalKw * 24 * 30;
    const opexMo = monthlyKwh * 0.12 + cstats.monthlySpendUsd;       // energy @ $0.12/kWh + carrier spend
    const costPerKwMo = itKw > 0 ? Math.round(opexMo / itKw) : 0;    // per IT kW
    const carbonTonnesMo = Math.round(monthlyKwh * 0.0004);          // ~0.4 kg CO2e / kWh
    const redundancyPct = racks.length ? Math.round(racks.filter((r) => r.redundancy && r.redundancy !== 'N').length / racks.length * 100) : 100;
    const hotSpots = zones.filter((z) => z.coolingCapacityKw > 0 && (z.coolingCapacityKw - z.currentLoadKw) / z.coolingCapacityKw < 0.1).length;
    const sev1Open = incidents.filter((i) => i.severity === 'SEV1' && !['Resolved', 'Closed'].includes(i.status)).length;
    const sev2Open = incidents.filter((i) => i.severity === 'SEV2' && !['Resolved', 'Closed'].includes(i.status)).length;
    const availability = Math.round((Math.max(95, 100 - sev1Open * 0.05 - sev2Open * 0.02 - istats.breaching * 0.01)) * 1000) / 1000;

    return {
      system, anomalies, saturatedCircuits,
      pue, itKw, totalKw, opexMo, costPerKwMo, carbonTonnesMo, redundancyPct, hotSpots, availability,
      powUtil: pct(powCur, powMax), powHeadroom: Math.round(powMax - powCur), gpuUtil: pct(gpuU, gpuT), gpuFree: gpuT - gpuU,
      coolHeadroom: Math.round(coolCap - coolLoad),
      istats, astats, ev, cstats, exposed, health, fleet,
      awaiting: changes.filter((c) => c.status === 'UnderReview').length,
      openChanges: changes.filter((c) => !['Closed', 'Cancelled'].includes(c.status)).length,
      hotSubnets: subnets.filter((s) => s.utilizationPct >= 85).length,
      // Over budget = over the block threshold of the site's facility type (90% enterprise / colo / telco, 95–97% hyperscale / GPU).
      hotRacks: racks.filter((r) => r.powerUtilizationPct >= capacityThresholds(dcs.find((d) => d.id === r.dataCenterId)?.dcTypeKey).rackPowerBlockPct).length,
      atpsPending: atps.filter((a) => a.status !== 'Accepted' && a.status !== 'Failed').length,
      openRisks: risks.filter((r) => r.status === 'Open').length,
      openDemand: plans.filter((d) => d.status === 'Submitted' || d.status === 'In Review').length,
      projAtRisk: projects.filter((p) => ['At Risk', 'Blocked'].includes(p.status)).length,
      projAvg: projects.length ? Math.round(projects.reduce((s, p) => s + p.percentComplete, 0) / projects.length) : 0,
      maint7: maint.filter((w) => ['Scheduled', 'In Progress'].includes(w.status) && new Date(w.scheduledStart).getTime() <= Date.now() + 7 * 864e5).length,
      activeByDev, healthByDc,
    };
  }, [racks, comp, zones, subnets, changes, managed, projects, atps, alarms, incidents, risks, plans, pos, boms, changeOrders, circuits, cterms, maint, interfaces, dcs]);

  const dcRows = useMemo(() => {
    const list = dcId === 'all' ? dcs : dcs.filter((d) => d.id === dcId);
    return list.map((d) => {
      const rk = racks.filter((r) => r.dataCenterId === d.id);
      const zn = zones.filter((z) => z.dataCenterId === d.id);
      const devIds = managed.filter((x) => x.dataCenterId === d.id).map((x) => x.id);
      const hs = m.healthByDc.get(d.id) ?? [];
      return {
        key: d.id, id: d.id, name: d.name, tier: d.tier, dcType: d.dcTypeKey ? dcTypeName(d.dcTypeKey) : undefined,
        util: rk.length ? Math.round(rk.reduce((s, r) => s + r.powerUtilizationPct, 0) / rk.length) : 0,
        coolHeadroom: Math.round(sum(zn.map((z) => z.coolingCapacityKw - z.currentLoadKw))),
        racks: rk.length,
        alarms: devIds.filter((id) => m.activeByDev.has(id)).length,
        health: hs.length ? Math.round(hs.reduce((s, v) => s + v, 0) / hs.length) : 100,
        incidents: incidents.filter((i) => i.dataCenterId === d.id && !['Resolved', 'Closed'].includes(i.status)).length,
      };
    });
  }, [dcs, racks, zones, managed, dcId, m.activeByDev, m.healthByDc, incidents]);

  const trend = useMemo(() => {
    const totalMax = sum(racks.map((r) => r.maxPowerKw)) || 1;
    const cur = sum(racks.map((r) => r.currentPowerKw));
    const add = bucketSum(assets, (a) => a.commissionedDate, (a) => (a.powerDrawW ?? 0) / 1000, 12, 30);
    const cum: number[] = []; let run = 0; for (const v of add) { run += v; cum.push(run); }
    const base = Math.max(0, cur - (cum[cum.length - 1] || 0));
    return cum.map((c) => Math.min(100, ((base + c) / totalMax) * 100));
  }, [racks, assets]);
  const fc = useMemo(() => {
    const powerRunway = capacityRunway('Power capacity', m.powUtil, trend);
    const nearestSubnet = [...subnets].filter((s) => s.forecastExhaustionDate).sort((a, b) => (a.forecastExhaustionDate ?? '').localeCompare(b.forecastExhaustionDate ?? ''))[0];
    return { powerRunway, nearestSubnet };
  }, [m.powUtil, trend, subnets]);

  const insights = [
    fc.powerRunway.status !== 'stable' && `At +${fc.powerRunway.growthPerMonth} pts/mo, power reaches 90% in ~${fc.powerRunway.monthsToThreshold} months (≈${fc.powerRunway.date}) — begin capacity planning now.`,
    m.system.band !== 'Healthy' && `System health ${m.system.overall}/100 (${m.system.band}); weakest domain is ${[...m.system.domains].sort((a, b) => a.score - b.score)[0].name} at ${[...m.system.domains].sort((a, b) => a.score - b.score)[0].score}.`,
    m.ev.spi < 1 && `Delivery is behind plan (SPI ${m.ev.spi.toFixed(2)}); portfolio forecast EAC ${fmtMoney(m.ev.eac)} against ${fmtMoney(m.ev.bac)} budget.`,
    m.exposed.length > 0 && `${m.exposed.length} site(s) lack a diverse second path — a single carrier or circuit failure would isolate them.`,
    fc.nearestSubnet && `Subnet ${fc.nearestSubnet.cidr} is forecast to exhaust ${(fc.nearestSubnet.forecastExhaustionDate ?? '').slice(0, 10)} at ${fc.nearestSubnet.utilizationPct}% used.`,
    m.gpuFree > 0 && `${m.gpuFree} GPU slots free with ${m.powHeadroom.toLocaleString()} kW power headroom for the next deployment.`,
  ].filter(Boolean).slice(0, 5) as string[];

  const queue = [
    m.istats.breaching > 0 && { sev: 0, t: `${m.istats.breaching} incident(s) breaching SLA`, to: '/incidents', icon: Siren },
    m.cstats.offline > 0 && { sev: 0, t: `${m.cstats.offline} circuit(s) offline`, to: '/circuits', icon: Cable },
    m.astats.storms > 0 && { sev: 0, t: `${m.astats.storms} correlated alarm storm(s)`, to: '/nms/alarms', icon: Flame },
    m.astats.critMajor > 0 && { sev: 1, t: `${m.astats.critMajor} critical/major alarm(s) active`, to: '/nms/alarms', icon: Siren },
    m.exposed.length > 0 && { sev: 1, t: `${m.exposed.length} site(s) single-homed / one carrier`, to: '/circuits', icon: GitBranch },
    m.projAtRisk > 0 && { sev: 1, t: `${m.projAtRisk} project(s) at risk or blocked`, to: '/delivery', icon: FolderKanban },
    m.awaiting > 0 && { sev: 1, t: `${m.awaiting} change(s) awaiting approval`, to: '/change/approvals', icon: ArrowLeftRight },
    m.hotRacks > 0 && { sev: 1, t: `${m.hotRacks} rack(s) over power budget`, to: '/capacity/power', icon: Zap },
    m.hotSubnets > 0 && { sev: 2, t: `${m.hotSubnets} subnet(s) nearing exhaustion`, to: '/ipam/subnets', icon: Network },
    m.openDemand > 0 && { sev: 2, t: `${m.openDemand} plan(s) awaiting approval`, to: '/planning', icon: Lightbulb },
  ].filter(Boolean).sort((a, b) => (a as { sev: number }).sev - (b as { sev: number }).sev) as { sev: number; t: string; to: string; icon: LucideIcon }[];

  const recentAudit = [...audit].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 7);

  const qTone = (sev: number) => sev === 0 ? 'bad' : sev === 1 ? 'warn' : 'info';
  const trendLabels = trend.map((_, i) => (i === trend.length - 1 ? 'Now' : `-${trend.length - 1 - i} mo`));
  const fcItems = [
    { key: 'power', title: 'Power capacity runway', color: runwayColor(fc.powerRunway.status), value: fc.powerRunway.monthsToThreshold == null ? 'stable' : `~${fc.powerRunway.monthsToThreshold} mo`, detail: fc.powerRunway.monthsToThreshold == null ? fc.powerRunway.detail : `${fc.powerRunway.detail} · ${fc.powerRunway.date}` },
    { key: 'ip', title: 'IP exhaustion (nearest)', color: 'var(--vw-color-orange-700)', value: fc.nearestSubnet ? (fc.nearestSubnet.forecastExhaustionDate ?? '').slice(0, 10) : '—', detail: fc.nearestSubnet ? `${fc.nearestSubnet.cidr} at ${fc.nearestSubnet.utilizationPct}% used` : 'no subnet forecast to exhaust' },
    { key: 'cost', title: 'Delivery cost forecast', color: m.ev.eac > m.ev.bac ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)', value: `${fmtMoney(m.ev.eac)} EAC`, detail: `budget ${fmtMoney(m.ev.bac)} · SPI ${m.ev.spi.toFixed(2)} · CPI ${m.ev.cpi.toFixed(2)}` },
  ];

  type DcRow = (typeof dcRows)[number];
  const dcCols: Col<DcRow>[] = [
    { key: 'name', header: 'Data center', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.dcType ?? '—'}</small></span> },
    { key: 'tier', header: 'Tier', sort: (r) => r.tier, render: (r) => <Chip tone="neutral" size="xs">{r.tier}</Chip> },
    { key: 'racks', header: 'Racks', align: 'right', sort: (r) => r.racks, render: (r) => <span className="num">{r.racks.toLocaleString()}</span> },
    { key: 'util', header: 'Power', sort: (r) => r.util, render: (r) => <Meter pct={r.util} width={88} color={r.util >= 85 ? 'var(--vw-color-red-500)' : 'var(--primaryColor500)'} /> },
    { key: 'cool', header: 'Cooling headroom', align: 'right', sort: (r) => r.coolHeadroom, render: (r) => <span className="num">{r.coolHeadroom.toLocaleString()} kW</span> },
    { key: 'health', header: 'Net health', align: 'right', sort: (r) => r.health, render: (r) => <b className="num" style={{ color: healthColor(r.health) }}>{r.health}</b> },
    { key: 'inc', header: 'Incidents', align: 'right', sort: (r) => r.incidents, render: (r) => r.incidents ? <Chip tone="orange" size="xs">{r.incidents}</Chip> : <span className="vw-label">—</span> },
    { key: 'alarms', header: 'Alarms', align: 'right', sort: (r) => r.alarms, render: (r) => r.alarms > 0 ? <Chip tone="error" size="xs">{r.alarms}</Chip> : <Chip tone="success" size="xs">0</Chip> },
  ];

  return (
    <OpsPage title="Command Center" description="Estate health, priority work, delivery and capacity in one place."
      actions={<>
        <Btn variant="filled" icon={ArrowLeftRight} onClick={() => openQa('change')}>Raise change</Btn>
        <Btn icon={Siren} onClick={() => openQa('incident')}>Log incident</Btn>
        <Btn icon={Wrench} onClick={() => openQa('maint')}>Schedule maintenance</Btn>
        <PageDcScopeSelect />
        <ViewSwitcher />
      </>}>

      {/* ── Estate pulse ── */}
      <StatGrid>
        <StatTile label="Network health" value={<Num v={m.health.avg} color={healthColor(m.health.avg)} />} sub="fleet average, out of 100" onClick={() => navigate('/nms')}>
          <SoftMeter pct={m.health.avg} tone={m.health.avg >= 80 ? 'success' : m.health.avg >= 60 ? 'warning' : 'error'} />
        </StatTile>
        <StatTile label="Open incidents" value={<Num v={m.istats.open.toLocaleString()} color={m.istats.breaching ? 'var(--vw-color-red-600)' : undefined} />}
          sub={m.istats.breaching ? `${m.istats.breaching} breaching SLA` : 'none breaching SLA'} subTone={m.istats.breaching ? 'bad' : undefined} onClick={() => navigate('/incidents')} />
        <StatTile label="Crit/major alarms" value={<Num v={m.astats.critMajor.toLocaleString()} color={m.astats.critMajor ? 'var(--vw-color-red-600)' : undefined} />}
          sub={m.astats.critMajor ? 'active now' : 'none active'} subTone={m.astats.critMajor ? 'bad' : undefined} onClick={() => navigate('/nms/alarms')} />
        <StatTile label="Power headroom" value={<>{m.powHeadroom.toLocaleString()}<small> kW</small></>} sub="spare rack power" onClick={() => navigate('/capacity')} />
        <StatTile label="Delivery SPI" value={<Num v={m.ev.spi.toFixed(2)} color={idxColor(m.ev.spi)} />} sub="schedule performance index" subTone={m.ev.spi < 0.9 ? 'bad' : m.ev.spi < 1 ? 'warn' : undefined} onClick={() => navigate('/delivery')} />
        <StatTile label="Circuits offline" value={<Num v={m.cstats.offline.toLocaleString()} color={m.cstats.offline ? 'var(--vw-color-red-600)' : undefined} />}
          sub={m.cstats.offline ? 'circuits down now' : 'none down'} subTone={m.cstats.offline ? 'bad' : undefined} onClick={() => navigate('/circuits')} />
      </StatGrid>

      {/* ── System health + efficiency, cost & resilience ── */}
      <div className="grid g-2">
        <Panel title="System health index" sub="Weighted estate index across domains" icon={Gauge}
          actions={<Chip tone={m.system.band === 'Healthy' ? 'success' : m.system.band === 'Degraded' ? 'warning' : 'error'} dot>{m.system.band}</Chip>}>
          <div className="mc-hero">
            <div className="mc-score">
              <span className="vw-card-metric-lg num" style={{ color: healthBandColor(m.system.overall) }}>{m.system.overall}</span>
              <span className="muted">of 100</span>
            </div>
            <div className="mc-domains">
              <BarList max={100} items={m.system.domains.map((d) => ({ key: d.name, label: d.name, value: d.score, display: String(d.score), color: healthBandColor(d.score) }))} />
            </div>
          </div>
        </Panel>
        <Panel title="Efficiency, cost & resilience" sub="Facility efficiency, run cost and resilience across the estate" icon={Leaf}>
          <KV cols={3} items={[
            ['PUE', <Num key="pue" v={m.pue.toFixed(2)} color={pueColor(m.pue)} />],
            ['Availability', <Num key="av" v={`${m.availability.toFixed(2)}%`} color={m.availability >= 99.9 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} />],
            ['Mean MTTR', <Num key="mttr" v={m.istats.mttrMins != null ? fmtDuration(m.istats.mttrMins) : '—'} />],
            ['Monthly opex', <Num key="opex" v={fmtMoney(m.opexMo)} />],
            ['Carbon', <Num key="co2" v={`${m.carbonTonnesMo.toLocaleString()} tCO₂/mo`} />],
            ['N+1 redundancy', <Num key="n1" v={`${m.redundancyPct}%`} color={m.redundancyPct >= 80 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} />],
          ]} />
        </Panel>
      </div>

      {/* ── What needs you now ── */}
      <div className="grid g-3">
        <Panel title="Attention queue" sub="What needs you now, most urgent first" icon={ListTodo} count={queue.length}>
          {queue.length === 0 ? <Empty icon={CircleCheck} title="All clear">Nothing needs you right now.</Empty> : (
            <div className="col mc-scroll" style={{ gap: 8 }}>
              {queue.map((q) => (
                <button key={q.t} type="button" className={`note note--${qTone(q.sev)} mc-q`} onClick={() => navigate(q.to)}>
                  <q.icon size={16} />
                  <span className="mc-q-txt" title={q.t}>{q.t}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="AI insights" sub="Signals drawn from the figures on this page" icon={Sparkles} count={insights.length}>
          {insights.length === 0 ? <Empty icon={Sparkles} title="Nothing notable right now" /> : (
            <div className="col mc-scroll" style={{ gap: 8 }}>
              {insights.map((t) => <div key={t} className="note note--info"><Lightbulb size={15} style={{ flexShrink: 0, marginTop: 2 }} /><span>{t}</span></div>)}
            </div>
          )}
        </Panel>
        <Panel title="Live activity" sub="Latest audit events" icon={Activity} actions={<PanelLink onClick={() => navigate('/audit')}>Audit</PanelLink>}>
          {recentAudit.length === 0 ? <Empty icon={Activity} title="No recent activity" /> : (
            <ul className="mc-feed mc-scroll">
              {recentAudit.map((e) => (
                <li key={e.id}>
                  <span className="mc-feed-summary">{e.summary}</span>
                  <div className="row between" style={{ gap: 10 }}>
                    <Chip tone="neutral" size="xs" title={e.action}>{e.action}</Chip>
                    <time className="num muted" dateTime={e.timestamp} title={e.timestamp}>{e.timestamp.slice(5, 16).replace('T', ' ')}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Build & run ── */}
      <div className="grid g-2">
        <Panel title="Plan-to-Build · delivery" sub="Build: portfolio earned value and approvals" icon={FolderKanban} actions={<PanelLink onClick={() => navigate('/delivery')}>Command Center</PanelLink>}>
          <div className="col" style={{ gap: 14 }}>
            <KV cols={4} items={[
              ['SPI', <Num key="spi" v={m.ev.spi.toFixed(2)} color={idxColor(m.ev.spi)} />],
              ['CPI', <Num key="cpi" v={m.ev.cpi.toFixed(2)} color={idxColor(m.ev.cpi)} />],
              ['EAC', <Num key="eac" v={fmtMoney(m.ev.eac)} />],
              ['Avg complete', <Num key="avg" v={`${m.projAvg}%`} />],
            ]} />
            <div className="col" style={{ gap: 0 }}>
              <StatRow label="Projects at risk / blocked" value={<span style={{ color: m.projAtRisk ? 'var(--vw-color-orange-700)' : undefined }}>{m.projAtRisk}</span>} />
              <StatRow label="ATPs pending" value={m.atpsPending} />
              <StatRow label="Changes awaiting approval" value={<span style={{ color: m.awaiting ? 'var(--vw-color-orange-700)' : undefined }}>{m.awaiting}</span>} />
              <StatRow label="Plans awaiting approval" value={m.openDemand} />
            </div>
          </div>
        </Panel>
        <Panel title="Operate · run" sub="Run: network, incidents, alarms and maintenance" icon={HeartPulse} actions={<PanelLink onClick={() => navigate('/operations')}>Operations</PanelLink>}>
          <div className="col" style={{ gap: 14 }}>
            <KV cols={4} items={[
              ['Net health', <Num key="nh" v={m.health.avg} color={healthColor(m.health.avg)} />],
              ['Mean MTTR', <Num key="mttr" v={m.istats.mttrMins != null ? fmtDuration(m.istats.mttrMins) : '—'} />],
              ['SLA comp.', <Num key="sla" v={`${m.istats.slaCompliancePct}%`} color={m.istats.slaCompliancePct >= 90 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} />],
              ['Storms', <Num key="st" v={m.astats.storms} color={m.astats.storms ? 'var(--vw-color-orange-700)' : undefined} />],
            ]} />
            <div className="col" style={{ gap: 0 }}>
              <StatRow label="Open incidents (breaching)" value={<span>{m.istats.open} <span className="muted">({m.istats.breaching})</span></span>} />
              <StatRow label="Active critical / major alarms" value={<span style={{ color: m.astats.critMajor ? 'var(--vw-color-red-600)' : undefined }}>{m.astats.critMajor}</span>} />
              <StatRow label="Config compliance" value={`${m.fleet.meanCompliancePct}%`} />
              <StatRow label="Maintenance (next 7d)" value={m.maint7} />
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Forecasting & anomalies ── */}
      <div className="grid g-2">
        <Panel title="Forecasting & runway" sub="When capacity, address space and budget run out" icon={TrendingUp}>
          <div className="col" style={{ gap: 10 }}>
            {fcItems.map((f) => (
              <div key={f.key} className="mc-fc" style={{ ['--c' as string]: f.color }}>
                <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <b className="strong">{f.title}</b>
                  <b className="num" style={{ color: f.color }}>{f.value}</b>
                </div>
                <span className="muted mc-fc-detail">{f.detail}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Anomalies detected" sub="Outside normal operating bands · click to investigate" icon={TriangleAlert} count={m.anomalies.length}>
          {m.anomalies.length === 0 ? <Empty icon={Radar} title="No anomalies">Operating within normal bands.</Empty> : (
            <div className="col mc-scroll" style={{ gap: 8, maxHeight: 280 }}>
              {m.anomalies.map((a: Anomaly) => (
                <button key={a.id} type="button" className="mc-fc is-click" onClick={() => navigate(a.to)} style={{ ['--c' as string]: anomalyColor(a.severity) }}>
                  <span className="mc-dot" style={{ background: anomalyColor(a.severity) }} />
                  <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><b className="strong">{a.title}</b><Chip tone="neutral" size="xs">{a.domain}</Chip></span>
                    <span className="muted mc-fc-detail">{a.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Connectivity ── */}
      <Panel title="Connectivity" sub="Carrier circuits, committed bandwidth, spend and spare GPU capacity" icon={Cable} actions={<PanelLink onClick={() => navigate('/circuits')}>Circuits</PanelLink>}>
        <KV cols={5} items={[
          ['Active circuits', <button key="ac" type="button" className="mc-link num" onClick={() => navigate('/circuits')}>{m.cstats.active.toLocaleString()}</button>],
          ['Committed', <Num key="cg" v={`${m.cstats.committedGbps.toLocaleString()} Gbps`} />],
          ['Monthly spend', <Num key="ms" v={fmtMoney(m.cstats.monthlySpendUsd)} />],
          ['Exposed sites', <button key="ex" type="button" className="mc-link num" style={m.exposed.length ? { color: 'var(--vw-color-orange-700)' } : undefined} onClick={() => navigate('/circuits')}>{m.exposed.length}</button>],
          ['GPU free', <Num key="gpu" v={m.gpuFree.toLocaleString()} />],
        ]} />
      </Panel>

      {/* ── Estate by data center ── */}
      <Panel title="Estate by data center" sub="Click a data center to open it" icon={Building} count={dcRows.length} flush actions={<PanelLink onClick={() => navigate('/map')}>Map</PanelLink>}>
        <DataTable rows={dcRows} cols={dcCols} onRow={(r) => navigate(`/facility/dc/${r.id}`)} pageSize={Math.max(25, dcRows.length)} maxHeight={420} compact
          empty={<Empty icon={Building} title="No data centers in scope" />} />
      </Panel>

      {/* ── Power trajectory ── */}
      <Panel title="Power utilisation trend" sub="12-month, from installed assets" icon={ChartLine} actions={<PanelLink onClick={() => navigate('/capacity')}>Forecast</PanelLink>}>
        <TimeChart labels={trendLabels} height={180} yMin={0} yMax={100} format={(v) => `${Math.round(v)}%`} legend={false} target={{ value: 85, label: '85%' }}
          series={[{ key: 'util', label: 'Power utilisation', color: 'var(--primaryColor500)', kind: 'line', values: trend }]} />
      </Panel>

      <Modal open={!!qa} destroyOnClose onOk={submitQa} onCancel={() => setQa(null)}
        title={qa === 'change' ? 'Raise change' : qa === 'incident' ? 'Log incident' : 'Schedule maintenance'}
        okText={qa === 'change' ? 'Submit for review' : qa === 'incident' ? 'Log incident' : 'Schedule'}
        confirmLoading={createCR.isPending || createInc.isPending || createMw.isPending}>
        <Form form={qaForm} layout="vertical" initialValues={{ type: qa === 'change' ? 'ConfigPush' : 'Network', risk: 'Medium', severity: 'SEV3', impact: 'No customer impact' }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="Short summary" /></Form.Item>
          {qa === 'change' && <>
            <Form.Item name="type" label="Change type" rules={[{ required: true }]}><Select placeholder="Select change type" options={CHANGE_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
            <Form.Item name="risk" label="Risk"><Select placeholder="Select risk" options={RISK_LEVEL.map((t) => ({ value: t, label: t }))} /></Form.Item>
          </>}
          {qa === 'incident' && <>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select placeholder="Select type" options={['Power', 'Cooling', 'Network', 'Rack', 'Capacity'].map((t) => ({ value: t, label: t }))} /></Form.Item>
            <Form.Item name="severity" label="Severity"><Select placeholder="Select severity" options={SEVERITY.map((t) => ({ value: t, label: t }))} /></Form.Item>
          </>}
          {qa === 'maint' && <>
            <Form.Item name="dataCenterId" label="Data center" rules={[{ required: true }]}><Select placeholder="Select data center" showSearch optionFilterProp="label" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
            <Form.Item name="window" label="Window" rules={[{ required: true }]}><DatePicker.RangePicker placeholder={["Start date", "End date"]} showTime style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="impact" label="Impact"><Select placeholder="Select impact" options={['No customer impact', 'Redundancy reduced during window', 'Brief packet loss expected', 'Service restart required'].map((t) => ({ value: t, label: t }))} /></Form.Item>
          </>}
        </Form>
      </Modal>
    </OpsPage>
  );
}
