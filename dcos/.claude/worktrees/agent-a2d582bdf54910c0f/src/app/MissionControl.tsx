import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Row, Col, Typography, List, Space, Progress, Timeline, Empty, Modal, Form, Input, Select, DatePicker } from 'antd';
import { VwButton as Button } from '../shared/components/vw/VwButton';
import { VwTable as Table } from '../shared/components/vw/VwTable';

import {
  ThunderboltOutlined, AlertOutlined, SwapOutlined, CloudServerOutlined, FireOutlined, ApiOutlined,
  ArrowRightOutlined, BulbOutlined, ProjectOutlined, BranchesOutlined, HeartOutlined,
  RiseOutlined, WarningOutlined, DashboardOutlined, ToolOutlined, CloudOutlined,
  CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, SafetyCertificateOutlined,
} from '../shared/icons';
import { useEntityList, useEntityCreate } from '../shared/hooks/useEntityCRUD';
import { CHANGE_TYPE, RISK_LEVEL, SEVERITY } from '../mock/data/enums';
import { useDcScope, useDcFilter, PageDcScopeSelect } from '../core/scope/DcScope';
import { KPICard } from '../shared/components/KPICard';
import { VwCard, VwChip, KpiTile } from '../shared/components/ux';
import { bucketSum } from '../shared/kpi/timeSeries';
import { dcTypeName, capacityThresholds } from '../mock/data/dcTypes';
import { ViewSwitcher } from '../shared/components/ux/ViewSwitcher';
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

const { Title, Text } = Typography;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const pct = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);
const idxColor = (v: number) => v >= 1 ? 'var(--vw-color-green-600)' : v >= 0.9 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
const pueColor = (v: number) => v <= 1.4 ? 'var(--vw-color-green-600)' : v <= 1.6 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)';
const SEV_TO_PRI = { SEV1: 'P1', SEV2: 'P2', SEV3: 'P3', SEV4: 'P4' } as const;
function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid #f4f4f4' }}><Text type="secondary" style={{ fontSize: "var(--vw-font-label-md)" }}>{label}</Text><span style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600 }}>{value}</span></div>;
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
  const TW = 1000, TH = 70;
  const tx = (i: number) => (i / (trend.length - 1)) * TW;
  const ty = (v: number) => 8 + (1 - v / 100) * (TH - 16);
  const tpath = trend.map((v, i) => `${i === 0 ? 'M' : 'L'}${tx(i)},${ty(v)}`).join(' ');

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
    m.istats.breaching > 0 && { sev: 0, t: `${m.istats.breaching} incident(s) breaching SLA`, to: '/incidents', icon: <AlertOutlined /> },
    m.cstats.offline > 0 && { sev: 0, t: `${m.cstats.offline} circuit(s) offline`, to: '/circuits', icon: <ApiOutlined /> },
    m.astats.storms > 0 && { sev: 0, t: `${m.astats.storms} correlated alarm storm(s)`, to: '/nms/alarms', icon: <FireOutlined /> },
    m.astats.critMajor > 0 && { sev: 1, t: `${m.astats.critMajor} critical/major alarm(s) active`, to: '/nms/alarms', icon: <AlertOutlined /> },
    m.exposed.length > 0 && { sev: 1, t: `${m.exposed.length} site(s) single-homed / one carrier`, to: '/circuits', icon: <BranchesOutlined /> },
    m.projAtRisk > 0 && { sev: 1, t: `${m.projAtRisk} project(s) at risk or blocked`, to: '/delivery', icon: <ProjectOutlined /> },
    m.awaiting > 0 && { sev: 1, t: `${m.awaiting} change(s) awaiting approval`, to: '/change/approvals', icon: <SwapOutlined /> },
    m.hotRacks > 0 && { sev: 1, t: `${m.hotRacks} rack(s) over power budget`, to: '/capacity/power', icon: <ThunderboltOutlined /> },
    m.hotSubnets > 0 && { sev: 2, t: `${m.hotSubnets} subnet(s) nearing exhaustion`, to: '/ipam/subnets', icon: <CloudServerOutlined /> },
    m.openDemand > 0 && { sev: 2, t: `${m.openDemand} plan(s) awaiting approval`, to: '/planning', icon: <BulbOutlined /> },
  ].filter(Boolean).sort((a, b) => (a as { sev: number }).sev - (b as { sev: number }).sev) as { sev: number; t: string; to: string; icon: React.ReactNode }[];
  const qColor = (sev: number) => sev === 0 ? 'var(--vw-color-red-600)' : sev === 1 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-gray-500)';

  const recentAudit = [...audit].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 7);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Command Center</div>
        <Space size={12} align="center" wrap>
          <PageDcScopeSelect />
          <ViewSwitcher />
        </Space>
      </div>

      <Space className="vw-wrap" style={{ marginBlock: 'var(--vw-space-md)' }} wrap>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", marginRight: 2 }}>Quick actions:</Text>
        <Button type="primary" icon={<SwapOutlined />} onClick={() => openQa('change')}>Raise change</Button>
        <Button icon={<AlertOutlined />} onClick={() => openQa('incident')}>Log incident</Button>
        <Button icon={<ToolOutlined />} onClick={() => openQa('maint')}>Schedule maintenance</Button>
      </Space>

      {/* ── Estate pulse: one headline per domain ── */}
      <VwCard variant="parent" title="Estate pulse" style={{ marginTop: "var(--vw-space-md)" }}>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Network health" value={m.health.avg} color={healthColor(m.health.avg)} onClick={() => navigate('/nms')} icon={<HeartOutlined />} iconTone="info" />
        <KPICard title="Open incidents" value={m.istats.open} color={m.istats.breaching ? 'var(--vw-color-red-600)' : undefined} onClick={() => navigate('/incidents')} icon={<AlertOutlined />} iconTone="error" />
        <KPICard title="Crit/major alarms" value={m.astats.critMajor} color={m.astats.critMajor ? 'var(--vw-color-red-600)' : undefined} onClick={() => navigate('/nms/alarms')} icon={<FireOutlined />} iconTone="error" />
        <KPICard title="Power headroom" value={m.powHeadroom} suffix=" kW" onClick={() => navigate('/capacity')} icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Delivery SPI" value={m.ev.spi.toFixed(2)} color={idxColor(m.ev.spi)} onClick={() => navigate('/delivery')} icon={<RiseOutlined />} iconTone="purple" />
        <KPICard title="Circuits offline" value={m.cstats.offline} color={m.cstats.offline ? 'var(--vw-color-red-600)' : undefined} onClick={() => navigate('/circuits')} icon={<ApiOutlined />} iconTone="error" />
      </div>
      </VwCard>

      {/* ── Executive scorecard: efficiency, cost & resilience ── */}
      <VwCard variant="parent" title="Efficiency, cost &amp; resilience" style={{ marginTop: "var(--vw-space-md)" }}>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="PUE" value={m.pue.toFixed(2)} color={pueColor(m.pue)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Availability" value={m.availability.toFixed(2)} suffix="%" color={m.availability >= 99.9 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Mean MTTR" value={m.istats.mttrMins != null ? fmtDuration(m.istats.mttrMins) : '—'} icon={<ClockCircleOutlined />} iconTone="warning" />
        <KPICard title="Monthly opex" value={fmtMoney(m.opexMo)} icon={<DollarOutlined />} iconTone="orange" />
        <KPICard title="Carbon" value={m.carbonTonnesMo.toLocaleString()} suffix=" tCO₂/mo" icon={<CloudOutlined />} iconTone="cyan" />
        <KPICard title="N+1 redundancy" value={m.redundancyPct} suffix="%" color={m.redundancyPct >= 80 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} icon={<SafetyCertificateOutlined />} iconTone="success" />
      </div>
      </VwCard>

      {/* ── System health index + intelligence ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>System health index · intelligence</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={14}>
          <VwCard size="small" style={{ height: '100%' }} title={<><DashboardOutlined /> System health index</>}>
            <Row gutter={20} align="middle">
              <Col xs={24} sm={9} style={{ textAlign: 'center' }}>
                <Progress type="dashboard" percent={m.system.overall} size={132} strokeColor={healthBandColor(m.system.overall)} format={(p) => <span style={{ fontSize: 26, fontWeight: 300, color: healthBandColor(m.system.overall) }}>{p}</span>} />
                <div style={{ fontSize: "var(--vw-font-heading-md)", fontWeight: 600, color: healthBandColor(m.system.overall), marginTop: "var(--vw-space-xxs)" }}>{m.system.band}</div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>weighted estate index</Text>
              </Col>
              <Col xs={24} sm={15}>
                {m.system.domains.map((d) => (
                  <div key={d.name} style={{ marginBottom: "var(--vw-space-md)" }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-sm)", marginBottom: 3 }}><Text type="secondary">{d.name}</Text><Text strong style={{ color: healthBandColor(d.score) }}>{d.score}</Text></div>
                    <Progress percent={d.score} size="small" showInfo={false} strokeColor={healthBandColor(d.score)} />
                  </div>
                ))}
              </Col>
            </Row>
          </VwCard>
        </Col>
        <Col xs={24} lg={10}>
          <VwCard size="small" style={{ height: '100%' }} title={<><BulbOutlined /> AI insights</>}>
            {insights.length === 0 ? <Text type="secondary">Nothing notable right now.</Text> : (
              <List size="small" dataSource={insights} renderItem={(t) => <List.Item><Space align="start"><BulbOutlined style={{ color: '#9747ff', marginTop: 3 }} /><span style={{ fontSize: "var(--vw-font-label-md)" }}>{t}</span></Space></List.Item>} />
            )}
          </VwCard>
        </Col>
      </Row>

      {/* ── Needs attention + live activity ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>What needs you now</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={16}>
          <VwCard size="small" style={{ height: '100%' }} title={<><BulbOutlined /> Cross-domain attention queue</>}>
            {queue.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="All clear — nothing needs you right now." /> : (
              <List size="small" dataSource={queue}
                renderItem={(q) => (
                  <List.Item style={{ borderInlineStart: `3px solid ${qColor(q.sev)}`, paddingInlineStart: 12, marginBottom: "var(--vw-space-xxs)" }}
                    actions={[<Button key="go" type="link" size="small" onClick={() => navigate(q.to)}>Go <ArrowRightOutlined /></Button>]}>
                    <Space><span style={{ color: qColor(q.sev) }}>{q.icon}</span><span style={{ fontSize: "var(--vw-font-label-md)", color: '#252525' }}>{q.t}</span></Space>
                  </List.Item>
                )} />
            )}
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title="Live activity" extra={<Button type="link" size="small" onClick={() => navigate('/audit')}>Audit →</Button>}>
            {recentAudit.length === 0 ? <Text type="secondary">No recent activity.</Text> : (
              <Timeline items={recentAudit.map((e) => ({ children: <span style={{ fontSize: "var(--vw-font-label-sm)" }}><VwChip>{e.action}</VwChip> {e.summary} · <Text type="secondary">{e.timestamp.slice(5, 16).replace('T', ' ')}</Text></span> }))} />
            )}
          </VwCard>
        </Col>
      </Row>

      {/* ── Build & Run: the dual mission ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Build &amp; run</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={12}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ProjectOutlined /> Plan-to-Build · delivery</>} extra={<Button type="link" size="small" onClick={() => navigate('/delivery')}>Command Center →</Button>}>
            <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: "var(--vw-space-md)" }}>
              <KpiTile label="SPI" value={m.ev.spi.toFixed(2)} color={idxColor(m.ev.spi)} icon={<RiseOutlined />} iconTone={m.ev.spi >= 1 ? 'success' : m.ev.spi >= 0.9 ? 'warning' : 'error'} />
              <KpiTile label="CPI" value={m.ev.cpi.toFixed(2)} color={idxColor(m.ev.cpi)} icon={<DashboardOutlined />} iconTone={m.ev.cpi >= 1 ? 'success' : m.ev.cpi >= 0.9 ? 'warning' : 'error'} />
              <KpiTile label="EAC" value={fmtMoney(m.ev.eac)} icon={<DollarOutlined />} iconTone="purple" />
              <KpiTile label="Avg complete" value={`${m.projAvg}%`} icon={<ProjectOutlined />} iconTone="info" />
            </div>
            <StatRow label="Projects at risk / blocked" value={<span style={{ color: m.projAtRisk ? 'var(--vw-color-orange-700)' : undefined }}>{m.projAtRisk}</span>} />
            <StatRow label="ATPs pending" value={m.atpsPending} />
            <StatRow label="Changes awaiting approval" value={<span style={{ color: m.awaiting ? 'var(--vw-color-orange-700)' : undefined }}>{m.awaiting}</span>} />
            <StatRow label="Plans awaiting approval" value={m.openDemand} />
          </VwCard>
        </Col>
        <Col xs={24} md={12}>
          <VwCard size="small" style={{ height: '100%' }} title={<><HeartOutlined /> Operate · run</>} extra={<Button type="link" size="small" onClick={() => navigate('/operations')}>Operations →</Button>}>
            <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: "var(--vw-space-md)" }}>
              <KpiTile label="Net health" value={m.health.avg} color={healthColor(m.health.avg)} icon={<HeartOutlined />} iconTone={m.health.avg >= 80 ? 'success' : m.health.avg >= 60 ? 'warning' : 'error'} />
              <KpiTile label="Mean MTTR" value={m.istats.mttrMins != null ? fmtDuration(m.istats.mttrMins) : '—'} icon={<ClockCircleOutlined />} iconTone="cyan" />
              <KpiTile label="SLA comp." value={`${m.istats.slaCompliancePct}%`} color={m.istats.slaCompliancePct >= 90 ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)'} icon={<SafetyCertificateOutlined />} iconTone={m.istats.slaCompliancePct >= 90 ? 'success' : 'warning'} />
              <KpiTile label="Storms" value={m.astats.storms} color={m.astats.storms ? 'var(--vw-color-orange-700)' : undefined} icon={<ThunderboltOutlined />} iconTone={m.astats.storms ? 'warning' : 'success'} />
            </div>
            <StatRow label="Open incidents (breaching)" value={<span>{m.istats.open} <Text type="secondary">({m.istats.breaching})</Text></span>} />
            <StatRow label="Active critical / major alarms" value={<span style={{ color: m.astats.critMajor ? 'var(--vw-color-red-600)' : undefined }}>{m.astats.critMajor}</span>} />
            <StatRow label="Config compliance" value={`${m.fleet.meanCompliancePct}%`} />
            <StatRow label="Maintenance (next 7d)" value={m.maint7} />
          </VwCard>
        </Col>
      </Row>

      {/* ── Forecasting & anomalies ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Forecasting &amp; anomalies</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} md={12}>
          <VwCard size="small" style={{ height: '100%' }} title={<><RiseOutlined /> Forecasting &amp; runway</>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ border: '1px solid #eef2f6', borderLeft: `3px solid ${runwayColor(fc.powerRunway.status)}`, borderRadius: "var(--vw-radius-sm)", padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Power capacity runway</Text>
                  <Text strong style={{ color: runwayColor(fc.powerRunway.status) }}>{fc.powerRunway.monthsToThreshold == null ? 'stable' : `~${fc.powerRunway.monthsToThreshold} mo`}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{fc.powerRunway.monthsToThreshold == null ? fc.powerRunway.detail : `${fc.powerRunway.detail} · ${fc.powerRunway.date}`}</Text>
              </div>
              <div style={{ border: '1px solid #eef2f6', borderLeft: '3px solid var(--vw-color-orange-700)', borderRadius: "var(--vw-radius-sm)", padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>IP exhaustion (nearest)</Text>
                  <Text strong style={{ color: 'var(--vw-color-orange-700)' }}>{fc.nearestSubnet ? (fc.nearestSubnet.forecastExhaustionDate ?? '').slice(0, 10) : '—'}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{fc.nearestSubnet ? `${fc.nearestSubnet.cidr} at ${fc.nearestSubnet.utilizationPct}% used` : 'no subnet forecast to exhaust'}</Text>
              </div>
              <div style={{ border: '1px solid #eef2f6', borderLeft: `3px solid ${m.ev.eac > m.ev.bac ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)'}`, borderRadius: "var(--vw-radius-sm)", padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Delivery cost forecast</Text>
                  <Text strong style={{ color: m.ev.eac > m.ev.bac ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)' }}>{fmtMoney(m.ev.eac)} EAC</Text>
                </div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>budget {fmtMoney(m.ev.bac)} · SPI {m.ev.spi.toFixed(2)} · CPI {m.ev.cpi.toFixed(2)}</Text>
              </div>
            </div>
          </VwCard>
        </Col>
        <Col xs={24} md={12}>
          <VwCard size="small" style={{ height: '100%' }} title={<><WarningOutlined /> Anomalies detected</>} extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{m.anomalies.length}</Text>}>
            {m.anomalies.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No anomalies — operating within normal bands." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 280, overflowY: 'auto' }}>
                {m.anomalies.map((a: Anomaly) => (
                  <div key={a.id} onClick={() => navigate(a.to)} style={{ display: 'flex', gap: 10, padding: '8px 10px', border: '1px solid #eef2f6', borderLeft: `3px solid ${anomalyColor(a.severity)}`, borderRadius: "var(--vw-radius-sm)", cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: anomalyColor(a.severity), marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#252525' }}>{a.title} <VwChip style={{ marginInlineStart: 4 }}>{a.domain}</VwChip></div>
                      <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{a.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>
      </Row>

      {/* ── Connectivity ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Connectivity</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Active circuits" value={m.cstats.active} onClick={() => navigate('/circuits')} icon={<ApiOutlined />} iconTone="info" />
        <KPICard title="Committed" value={m.cstats.committedGbps} suffix=" Gbps" icon={<SwapOutlined />} iconTone="cyan" />
        <KPICard title="Monthly spend" value={fmtMoney(m.cstats.monthlySpendUsd)} icon={<DollarOutlined />} iconTone="orange" />
        <KPICard title="Exposed sites" value={m.exposed.length} color={m.exposed.length ? 'var(--vw-color-orange-700)' : undefined} onClick={() => navigate('/circuits')} icon={<WarningOutlined />} iconTone="error" />
        <KPICard title="GPU free" value={m.gpuFree} icon={<CloudServerOutlined />} iconTone="purple" />
      </div>

      {/* ── Estate by data center ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Estate by data center</div>
      <VwCard size="small" extra={<Button type="link" size="small" onClick={() => navigate('/map')}>Map →</Button>}>
        <Table size="small" rowKey="id" dataSource={dcRows} pagination={false} scroll={{ x: 'max-content' }}
          onRow={(r) => ({ onClick: () => navigate(`/facility/dc/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Data center', dataIndex: 'name' },
            { title: 'Type', dataIndex: 'dcType', width: 200, render: (t?: string) => t ? <VwChip color="blue">{t}</VwChip> : <Text type="secondary">—</Text> },
            { title: 'Tier', dataIndex: 'tier', width: 90, render: (t: string) => <VwChip>{t}</VwChip> },
            { title: 'Racks', dataIndex: 'racks', width: 70, align: 'right' },
            { title: 'Power', dataIndex: 'util', width: 160, render: (v: number) => <Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} /> },
            { title: 'Cooling headroom', dataIndex: 'coolHeadroom', width: 140, align: 'right', render: (v: number) => `${v.toLocaleString()} kW` },
            { title: 'Net health', dataIndex: 'health', width: 110, render: (v: number) => <Text strong style={{ color: healthColor(v) }}>{v}</Text> },
            { title: 'Incidents', dataIndex: 'incidents', width: 90, align: 'center', render: (v: number) => v ? <VwChip color="orange">{v}</VwChip> : <Text type="secondary">—</Text> },
            { title: 'Alarms', dataIndex: 'alarms', width: 80, align: 'center', render: (v: number) => v > 0 ? <VwChip color="red">{v}</VwChip> : <VwChip color="green">0</VwChip> },
          ]} />
      </VwCard>

      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Power trajectory</div>
      <VwCard size="small" title="Power utilisation trend — 12-month, from installed assets" extra={<Button type="link" onClick={() => navigate('/capacity')}>Forecast →</Button>}>
        <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" height={TH} preserveAspectRatio="none">
          <path d={tpath} fill="none" stroke="var(--primaryColor500)" strokeWidth={2} />
          <line x1={0} y1={ty(85)} x2={TW} y2={ty(85)} stroke="#fca5a5" strokeDasharray="4 3" />
        </svg>
      </VwCard>

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
    </div>
  );
}
