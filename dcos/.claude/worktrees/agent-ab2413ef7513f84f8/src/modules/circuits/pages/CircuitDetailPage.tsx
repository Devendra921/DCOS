import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Descriptions, Empty, Space, Typography, Steps, Row, Col, Progress } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, AlertOutlined, ApiOutlined, BranchesOutlined } from '../../../shared/icons';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityDetail, useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { circuitView, lifecycleStep, LIFECYCLE, fmtMoney, fmtGbps, utilColor, CKT_STATUS_COLOR, HEALTH_COLOR } from '../lib/circuits';
import { buildSeries, percentile } from '../../nms/lib/metrics';
import { SLA_TARGETS } from '../../operations/lib/sla';
import type { Circuit, Provider, CircuitType, CircuitTermination, DataCenter, ProviderNetwork, Interface, ManagedDevice } from '../../../mock/data/types';

const { Text } = Typography;

function MiniSpark({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return null;
  const w = 160, h = 40, min = Math.min(...vals), max = Math.max(...vals, min + 1);
  const x = (i: number) => (i / (vals.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / (max - min)) * (h - 6);
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return <svg width={w} height={h}><defs><linearGradient id="cks" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#cks)" /><path d={path} fill="none" stroke={color} strokeWidth={1.5} /></svg>;
}

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
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const mds = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const allCircuits = (useEntityList('circuits', { pageSize: 5000 }).data?.data ?? []) as unknown as Circuit[];
  const createIncident = useEntityCreate('incidents');
  const audit = useRecordAudit();

  const c = data as unknown as Circuit | null;
  const ifById = useMemo(() => new Map(ifaces.map((i) => [i.id, i])), [ifaces]);
  const devName = useMemo(() => Object.fromEntries(mds.map((d) => [d.id, d.hostname])), [mds]);

  if (!c) return <div><Empty description="Circuit not found" /></div>;
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

  const raiseIncident = () => {
    const now = new Date().toISOString();
    const t = SLA_TARGETS.SEV2;
    createIncident.mutate({
      incId: `INC-CKT-${Date.now().toString().slice(-4)}`, title: `Circuit down — ${c.cid} (${provider?.name ?? 'carrier'})`, type: 'Network', severity: 'SEV2',
      status: 'Open', priority: 'P2', affectedResourceType: 'Asset', affectedResourceIds: aTerm?.deviceId ? [aTerm.deviceId] : [c.id], dataCenterId: aTerm?.dataCenterId, detectedAt: now,
      slaResponseMins: t.responseMins, slaResolveMins: t.resolveMins, reportedBy: 'Monitoring System',
      worklog: [{ at: now, author: 'Monitoring', kind: 'StatusChange', text: `Raised from circuit ${c.cid} down — engage ${provider?.name ?? 'carrier'} (${provider?.restorationHrs ?? 4}h restoration SLA).` }],
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'NOC', createdById: 'noc',
    }, { onSuccess: (rec: Record<string, unknown>) => { audit('Circuit', c.cid, 'incident raised', c.cid); message.success('Incident raised'); navigate(`/incidents/${rec.id as string}`); } });
  };

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/circuits')}>Circuits</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{c.cid}</div>
        <VwChip color="blue">{provider?.name ?? '?'}</VwChip>
        {type && <VwChip>{type.name}</VwChip>}
        {c.purpose && <VwChip>{c.purpose}</VwChip>}
        <VwChip color={CKT_STATUS_COLOR[c.status]}>{c.status}</VwChip>
        <VwChip color={HEALTH_COLOR[v.health]}>{v.health}</VwChip>
        {c.status === 'Offline' && <Button danger size="small" icon={<AlertOutlined />} onClick={raiseIncident}>Raise incident</Button>}
      </Space>

      {/* Provisioning lifecycle */}
      <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Steps size="small" current={lifecycleStep(c)} items={LIFECYCLE.map((l) => ({ title: l }))} />
      </VwCard>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <VwCard size="small" title="Terminations (A / Z)" style={{ marginBottom: "var(--vw-space-lg)" }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-md)" }}>
              <div style={{ border: '1px solid #eef2f6', borderLeft: '3px solid var(--primaryColor500)', borderRadius: "var(--vw-radius-sm)", padding: "var(--vw-space-md)" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><VwChip color="geekblue">A-side · your facility</VwChip><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{fmtGbps(aTerm?.portSpeedMbps)} port</Text></div>
                <div style={{ marginTop: "var(--vw-space-sm)", fontSize: "var(--vw-font-label-md)" }}>
                  <div>Data center: {aTerm?.dataCenterId ? <a onClick={() => navigate(`/facility/dc/${aTerm.dataCenterId}`)}>{dcName(aTerm.dataCenterId)}</a> : '—'}</div>
                  <div style={{ marginTop: 3 }}>Lands on: {aTerm?.deviceId ? <a onClick={() => navigate(`/nms/devices/${aTerm.deviceId}`)}>{devName[aTerm.deviceId]}</a> : '—'} {iface && <Text type="secondary">· {iface.name}</Text>}</div>
                  <div style={{ marginTop: 3 }}>Cross-connect: <Text code>{aTerm?.xconnectId ?? '—'}</Text></div>
                </div>
              </div>
              <div style={{ border: '1px solid #eef2f6', borderLeft: '3px solid #9747ff', borderRadius: "var(--vw-radius-sm)", padding: "var(--vw-space-md)" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><VwChip color="purple">Z-side · carrier</VwChip></div>
                <div style={{ marginTop: "var(--vw-space-sm)", fontSize: "var(--vw-font-label-md)" }}>Provider network: {pnName(zTerm?.providerNetworkId) ?? '—'}</div>
              </div>
            </div>
          </VwCard>

          <VwCard size="small" title={<><ApiOutlined /> Utilisation (24h)</>} style={{ marginBottom: "var(--vw-space-lg)" }}>
            {c.status === 'Active' && iface ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-xl)" }}>
                <div><div style={{ fontSize: "var(--vw-font-value-xl)", fontWeight: 300, color: utilColor(v.util) }}>{v.util}%</div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>now · {v.actualGbps}G of {fmtGbps(c.commitRateMbps)}</Text></div>
                <div><div style={{ fontSize: "var(--vw-font-heading-xl)", fontWeight: 400, color: utilColor(p95) }}>{p95}%</div><Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>p95</Text></div>
                <div style={{ marginLeft: 'auto' }}><MiniSpark vals={series} color={utilColor(p95)} /></div>
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={c.status === 'Active' ? 'No bound interface' : 'Utilisation available once active'} />}
          </VwCard>

          <VwCard size="small" title={<><BranchesOutlined /> Redundancy &amp; diversity</>}>
            <div style={{ marginBottom: "var(--vw-space-sm)" }}>
              {siblings.filter((s) => s.status === 'Active').length === 0
                ? <VwChip color="error">Single-homed — no diverse path for {c.purpose ?? 'this purpose'} at this site</VwChip>
                : <VwChip color="success">{siblings.filter((s) => s.status === 'Active').length + 1} diverse path(s) for {c.purpose ?? 'this purpose'} at this site</VwChip>}
            </div>
            {siblings.length === 0 ? <Text type="secondary" style={{ fontSize: "var(--vw-font-label-md)" }}>No sibling circuits in this diversity group.</Text> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {siblings.slice(0, 5).map((s) => (
                  <div key={s.id} onClick={() => navigate(`/circuits/${s.id}`)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', border: '1px solid #f4f4f4', borderRadius: "var(--vw-radius-sm)", cursor: 'pointer' }}>
                    <Text style={{ fontSize: "var(--vw-font-label-md)" }}>{s.cid} <Text type="secondary">· {providers.find((p) => p.id === s.providerId)?.name}</Text></Text>
                    <VwChip color={CKT_STATUS_COLOR[s.status]} style={{ marginInlineEnd: 0 }}>{s.status}</VwChip>
                  </div>
                ))}
              </div>
            )}
          </VwCard>
        </Col>

        <Col xs={24} lg={10}>
          <VwCard size="small" title="Commercial & SLA" style={{ marginBottom: "var(--vw-space-lg)" }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Monthly cost">{fmtMoney(c.monthlyCostUsd)}</Descriptions.Item>
              <Descriptions.Item label="Annualised">{fmtMoney(annual)}</Descriptions.Item>
              <Descriptions.Item label="Committed rate">{fmtGbps(c.commitRateMbps)}</Descriptions.Item>
              <Descriptions.Item label="Uptime SLA">{c.slaUptimePct != null ? `${c.slaUptimePct}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Restoration SLA">{provider?.restorationHrs != null ? `${provider.restorationHrs}h` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Contract">{c.contractStart?.slice(0, 10) ?? '—'} → {c.contractEnd?.slice(0, 10) ?? '—'}</Descriptions.Item>
            </Descriptions>
          </VwCard>
          <VwCard size="small" title="Provider">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Carrier">{provider?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Account">{provider?.account ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="ASN">{provider?.asn ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Support tier">{provider?.supportTier ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Support line">{provider?.supportPhone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Portal">{provider?.portalUrl ? <a href={provider.portalUrl} target="_blank" rel="noreferrer">portal ↗</a> : '—'}</Descriptions.Item>
            </Descriptions>
          </VwCard>
        </Col>
      </Row>
    </div>
  );
}
