import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Steps } from 'antd';
import { Building2, Cable, DollarSign, Gauge, GitBranch, ListChecks, Siren } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, KV, Panel } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { Sparkline } from '../../../ops/charts/Sparkline';
import { useEntityDetail, useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { circuitView, lifecycleStep, LIFECYCLE, fmtMoney, fmtGbps, utilColor } from '../lib/circuits';
import { buildSeries, percentile } from '../../nms/lib/metrics';
import { SLA_TARGETS } from '../../operations/lib/sla';
import type { Circuit, Provider, CircuitType, CircuitTermination, DataCenter, ProviderNetwork, Interface, ManagedDevice, Cable as CableRec, Device } from '../../../mock/data/types';
import { fmtCapacity, patchText } from '../../dcim/lib/estateView';

const stamp = () => Date.now().toString();
const statusTone = (st: string): Tone => (st === 'Active' ? 'success' : st === 'Offline' ? 'error' : st === 'Provisioning' ? 'purple' : st === 'Planned' ? 'info' : 'neutral');
const HEALTH_TONE: Record<string, Tone> = { Up: 'success', Degraded: 'orange', Down: 'error', Pending: 'neutral' };

export default function CircuitDetailPage() {
  const { circuitId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { data } = useEntityDetail('circuits', circuitId);
  const providers = (useEntityList('providers', { pageSize: 200 }).data?.data ?? []) as unknown as Provider[];
  const types = (useEntityList('circuitTypes', { pageSize: 200 }).data?.data ?? []) as unknown as CircuitType[];
  const terms = (useEntityList('circuitTerminations', { pageSize: 5000 }).data?.data ?? []) as unknown as CircuitTermination[];
  const dcs = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const pnets = (useEntityList('providerNetworks', { pageSize: 500 }).data?.data ?? []) as unknown as ProviderNetwork[];
  const ifaces = (useEntityList('interfaces', { pageSize: 200000 }).data?.data ?? []) as unknown as Interface[];
  const cables = (useEntityList('cables', { pageSize: 20000 }).data?.data ?? []) as unknown as CableRec[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const mds = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const allCircuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const createIncident = useEntityCreate('incidents');
  const audit = useRecordAudit();

  const c = data as unknown as Circuit | null;
  const ifById = useMemo(() => new Map(ifaces.map((i) => [i.id, i])), [ifaces]);
  const devName = useMemo(() => Object.fromEntries(mds.map((d) => [d.id, d.hostname])), [mds]);

  if (!c) return <PageEmptyState title="Circuit not found" />;
  const provider = providers.find((p) => p.id === c.providerId);
  const type = types.find((t) => t.id === c.circuitTypeId);
  const v = circuitView(c, terms, ifById);
  const aTerm = v.aTerm, zTerm = v.zTerm;
  const iface = aTerm?.interfaceId ? ifById.get(aTerm.interfaceId) : undefined;
  const dcName = (id?: string) => dcs.find((d) => d.id === id)?.name;
  const pnName = (id?: string) => pnets.find((n) => n.id === id)?.name;
  const series = iface ? buildSeries(iface.id, iface.utilizationPct, iface.speedGbps || 10).map((p) => p.util) : [];
  const p95 = series.length ? percentile(series, 95) : 0;
  const siblings = allCircuits.filter((x) => x.diversityGroup && x.diversityGroup === c.diversityGroup && x.id !== c.id);
  const annual = c.monthlyCostUsd ? c.monthlyCostUsd * 12 : undefined;
  /* physical cables that hand off to this circuit (carrierCircuitId holds the record id or the carrier's circuit id) */
  const carried = cables.filter((x) => x.carrierCircuitId && (x.carrierCircuitId === c.id || x.carrierCircuitId === c.cid || x.carrierCircuitId === c.cktId));
  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  const raiseIncident = () => {
    const now = new Date().toISOString();
    const t = SLA_TARGETS.SEV2;
    createIncident.mutate({
      incId: `INC-CKT-${stamp().slice(-4)}`, title: `Circuit down — ${c.cid} (${provider?.name ?? 'carrier'})`, type: 'Network', severity: 'SEV2',
      status: 'Open', priority: 'P2', affectedResourceType: 'Asset', affectedResourceIds: aTerm?.deviceId ? [aTerm.deviceId] : [c.id], dataCenterId: aTerm?.dataCenterId, detectedAt: now,
      slaResponseMins: t.responseMins, slaResolveMins: t.resolveMins, reportedBy: 'Monitoring System',
      worklog: [{ at: now, author: 'Monitoring', kind: 'StatusChange', text: `Raised from circuit ${c.cid} down — engage ${provider?.name ?? 'carrier'} (${provider?.restorationHrs ?? 4}h restoration SLA).` }],
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NOC', createdById: 'noc',
    }, { onSuccess: (rec: Record<string, unknown>) => { audit('Circuit', c.cid, 'incident raised', c.cid); message.success('Incident raised'); navigate(`/incidents/${rec.id as string}`); } });
  };

  const activeSiblings = siblings.filter((s) => s.status === 'Active').length;
  const live = c.status === 'Active' && Boolean(iface);

  return (
    <OpsPage title={c.cid}
      description={[provider?.name ?? '?', type?.name, c.purpose].filter(Boolean).join(' · ')}
      actions={<>
        <Chip tone={statusTone(c.status)} dot>{c.status}</Chip>
        <Chip tone={HEALTH_TONE[v.health] ?? 'neutral'}>{v.health}</Chip>
        {c.status === 'Offline' && <Btn variant="danger" icon={Siren} onClick={raiseIncident}>Raise incident</Btn>}
      </>}>

      <StatGrid cols={5}>
        <StatTile label="Committed rate" value={fmtGbps(c.commitRateMbps)} sub={`${fmtGbps(aTerm?.portSpeedMbps)} port`} />
        <StatTile label="Utilisation now" value={live ? <>{v.util}<small>%</small></> : '—'} sub={live ? `${v.actualGbps}G in use` : 'not measured'} subTone={live && v.util >= 85 ? 'bad' : undefined}>
          {live && <SoftMeter pct={v.util} tone={v.util >= 85 ? 'error' : v.util >= 75 ? 'warning' : 'info'} />}
        </StatTile>
        <StatTile label="p95 (24h)" value={live ? <>{p95}<small>%</small></> : '—'} sub="95th percentile" />
        <StatTile label="Monthly cost" value={fmtMoney(c.monthlyCostUsd)} sub={`${fmtMoney(annual)} a year`} />
        <StatTile label="Diverse paths" value={activeSiblings + 1} sub={activeSiblings ? `for ${c.purpose ?? 'this purpose'}` : 'single-homed'} subTone={activeSiblings ? undefined : 'bad'} />
      </StatGrid>

      {/* Provisioning lifecycle */}
      <Panel title="Provisioning lifecycle" icon={ListChecks}>
        <Steps size="small" current={lifecycleStep(c)} items={LIFECYCLE.map((l) => ({ title: l }))} />
      </Panel>

      <div className="grid g-main-side">
        <div className="col">
          <Panel title="Terminations (A / Z)" icon={Cable}>
            <div className="col">
              <div className="col" style={{ gap: 8, paddingLeft: 12, borderLeft: '3px solid var(--primaryColor500)' }}>
                <div className="row between"><Chip tone="info">A-side · your facility</Chip><span className="vw-label">{fmtGbps(aTerm?.portSpeedMbps)} port</span></div>
                <KV cols={3} items={[
                  ['Data center', aTerm?.dataCenterId ? <a className="ent-link" onClick={() => navigate(`/facility/dc/${aTerm.dataCenterId}`)}>{dcName(aTerm.dataCenterId)}</a> : '—'],
                  ['Lands on', aTerm?.deviceId ? <><a className="ent-link" onClick={() => navigate(`/nms/devices/${aTerm.deviceId}`)}>{devName[aTerm.deviceId]}</a>{iface && <span className="muted"> · {iface.name}</span>}</> : '—'],
                  ['Cross-connect', <span className="mono">{aTerm?.xconnectId ?? '—'}</span>],
                ]} />
              </div>
              <div className="col" style={{ gap: 8, paddingLeft: 12, borderLeft: '3px solid var(--vw-color-purple-500, #9747ff)' }}>
                <div className="row"><Chip tone="purple">Z-side · carrier</Chip></div>
                <KV cols={3} items={[['Provider network', pnName(zTerm?.providerNetworkId) ?? '—']]} />
              </div>
            </div>
          </Panel>

          <Panel title="Utilisation (24h)" icon={Gauge}>
            {live ? (
              <div className="circuit-utilisation">
                <div><div className="circuit-utilisation-value" style={{ color: utilColor(v.util) }}>{v.util}%</div><span className="vw-label">now · {v.actualGbps}G of {fmtGbps(c.commitRateMbps)}</span></div>
                <div><div className="circuit-percentile-value" style={{ color: utilColor(p95) }}>{p95}%</div><span className="vw-label">p95</span></div>
                <div style={{ marginLeft: 'auto', width: 160 }}><Sparkline values={series} color={utilColor(p95)} height={40} /></div>
              </div>
            ) : <Empty icon={Gauge} title={c.status === 'Active' ? 'No bound interface' : 'Utilisation available once active'} />}
          </Panel>

          <Panel title="Redundancy & diversity" icon={GitBranch} count={siblings.length}>
            <div style={{ marginBottom: 'var(--vw-space-sm)' }}>
              {activeSiblings === 0
                ? <Chip tone="error">Single-homed — no diverse path for {c.purpose ?? 'this purpose'} at this site</Chip>
                : <Chip tone="success">{activeSiblings + 1} diverse path(s) for {c.purpose ?? 'this purpose'} at this site</Chip>}
            </div>
            {siblings.length === 0 ? <span className="vw-label">No sibling circuits in this diversity group.</span> : (
              <div className="col" style={{ gap: 6 }}>
                {siblings.slice(0, 5).map((s) => (
                  <div key={s.id} className="row between" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/circuits/${s.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/circuits/${s.id}`); }}>
                    <span><span className="ent-link mono">{s.cid}</span> <span className="muted">· {providers.find((p) => p.id === s.providerId)?.name}</span></span>
                    <Chip tone={statusTone(s.status)} size="xs" dot>{s.status}</Chip>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Cables on this circuit" icon={Cable} count={carried.length}>
            {carried.length === 0 ? <span className="vw-label">No cable records name this circuit.</span> : (
              <div className="col" style={{ gap: 6 }}>
                {carried.map((x) => (
                  <div key={x.id}>
                    <div><a className="ent-link" onClick={() => navigate(`/facility/devices/${x.aDeviceId}`)}>{deviceName(x.aDeviceId)}</a> ↔ <a className="ent-link" onClick={() => navigate(`/facility/devices/${x.bDeviceId}`)}>{deviceName(x.bDeviceId)}</a></div>
                    <span className="vw-label">{[x.role, fmtCapacity(x.capacityMbps), x.strand ? `strand ${x.strand}` : undefined, patchText(x)].filter(Boolean).join(' · ') || x.cableType}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="col">
          <Panel title="Commercial & SLA" icon={DollarSign}>
            <KV cols={1} items={[
              ['Monthly cost', fmtMoney(c.monthlyCostUsd)],
              ['Annualised', fmtMoney(annual)],
              ['Committed rate', fmtGbps(c.commitRateMbps)],
              ['Uptime SLA', c.slaUptimePct != null ? `${c.slaUptimePct}%` : '—'],
              ['Restoration SLA', provider?.restorationHrs != null ? `${provider.restorationHrs}h` : '—'],
              ['Contract', `${c.contractStart?.slice(0, 10) ?? '—'} → ${c.contractEnd?.slice(0, 10) ?? '—'}`],
            ]} />
          </Panel>
          <Panel title="Provider" icon={Building2}>
            <KV cols={1} items={[
              ['Carrier', provider?.name ?? '—'],
              ['Account', provider?.account ?? '—'],
              ['ASN', provider?.asn ?? '—'],
              ['Support tier', provider?.supportTier ?? '—'],
              ['Support line', provider?.supportPhone ?? '—'],
              ['Portal', provider?.portalUrl ? <a className="ent-link" href={provider.portalUrl} target="_blank" rel="noreferrer">portal ↗</a> : '—'],
            ]} />
          </Panel>
        </div>
      </div>
    </OpsPage>
  );
}
