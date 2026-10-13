import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Typography, Tooltip } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { DashboardOutlined, ThunderboltOutlined, HomeOutlined, CloudOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DataContract } from '../components/PreviewScaffold';
import { MiniArea, MiniBars, synthSeries } from '../components/previewViz';
import { dcTypeProfile, pueFor, pueTargetFor } from '../../../mock/data/dcTypes';
import type { Rack, CoolingZone, DataCenter } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;

/**
 * PUE & sustainability. PUE is derived per site from its facility type — a
 * liquid-cooled GPU hall runs near 1.2, a DX-cooled server room near 1.6 — and
 * judged against that type's target, then IT-load-weighted into the estate figure.
 * Everything else on the page (renewables, WUE, carbon intensity) stays a
 * future-state preview until metered data lands (see the data contract below).
 */
export default function PueSustainabilityPreview() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const zones = (useEntityList('coolingZones', { pageSize: 2000, filters: dcF }).data?.data ?? []) as unknown as CoolingZone[];

  const sites = useMemo(() => {
    const inScope = new Set(racks.map((r) => r.dataCenterId));
    return dcs.filter((d) => inScope.has(d.id)).map((d) => {
      const it = racks.filter((r) => r.dataCenterId === d.id).reduce((s, r) => s + r.currentPowerKw, 0);
      const cool = zones.filter((z) => z.dataCenterId === d.id).reduce((s, z) => s + z.currentLoadKw, 0);
      const pue = pueFor(d.dcTypeKey, it, cool);
      const target = pueTargetFor(d.dcTypeKey);
      const t = dcTypeProfile(d.dcTypeKey);
      return { key: d.id, id: d.id, name: d.name, typeName: t?.name ?? 'untyped', segment: t?.segment, cooling: t?.cooling ?? '—', itKw: Math.round(it), facilityKw: Math.round(it * pue), pue, target, onTrack: pue <= target };
    }).sort((a, b) => b.itKw - a.itKw);
  }, [dcs, racks, zones]);

  const k = useMemo(() => {
    const itLoadKw = sites.reduce((s, x) => s + x.itKw, 0);
    const facilityKw = sites.reduce((s, x) => s + x.facilityKw, 0);
    const pue = itLoadKw > 0 ? Math.round((facilityKw / itLoadKw) * 100) / 100 : 0;
    const coolingKw = Math.round(zones.reduce((s, z) => s + z.currentLoadKw, 0) * 0.3) || Math.round(itLoadKw * 0.25);
    const lossKw = Math.max(0, facilityKw - itLoadKw - coolingKw);
    const carbonTpy = Math.round(facilityKw * 8.76 * 0.35); // kW→MWh/yr × tCO2e/MWh (simulated grid factor)
    const weightedTarget = itLoadKw > 0 ? Math.round((sites.reduce((s, x) => s + x.target * x.itKw, 0) / itLoadKw) * 100) / 100 : 1.5;
    return { itLoadKw, coolingKw, facilityKw, lossKw, pue, carbonTpy, weightedTarget, offTrack: sites.filter((x) => !x.onTrack).length };
  }, [sites, zones]);

  const pueTrend = synthSeries(12, k.pue + 0.06, 0.04).map((v) => Math.round(v * 100) / 100);

  const esg = [
    { metric: 'PUE (IT-load weighted)', value: k.pue.toFixed(2), target: `≤ ${k.weightedTarget.toFixed(2)} (per-type targets)`, status: k.pue <= k.weightedTarget ? 'On track' : 'Above target' },
    { metric: 'Sites above their type’s PUE target', value: String(k.offTrack), target: '0', status: k.offTrack === 0 ? 'On track' : 'Above target' },
    { metric: 'Renewable energy mix', value: '38%', target: '≥ 60%', status: 'Behind' },
    { metric: 'WUE (Water Usage Effectiveness)', value: '1.6 L/kWh', target: '≤ 1.8', status: 'On track' },
    { metric: 'Carbon intensity', value: '0.35 tCO₂e/MWh', target: '≤ 0.20', status: 'Behind' },
    { metric: 'Annual carbon footprint', value: `${k.carbonTpy.toLocaleString()} tCO₂e`, target: '↓ YoY', status: 'Monitoring' },
  ];

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3} style={{ marginBottom: "var(--vw-space-md)" }}>PUE &amp; Sustainability</div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="PUE (estate)" value={k.pue} color={k.pue <= k.weightedTarget ? 'var(--vw-color-green-600)' : '#f59e0b'} info={`Total facility power ÷ IT load, weighted by IT load across sites. Target ≤ ${k.weightedTarget.toFixed(2)} from each site's facility-type target.`} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="IT Load" value={k.itLoadKw.toLocaleString()} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Total Facility" value={k.facilityKw.toLocaleString()} suffix=" kW" icon={<HomeOutlined />} iconTone="info" />
        <KPICard title="Annual Carbon" value={k.carbonTpy.toLocaleString()} suffix=" tCO₂e" color="var(--vw-color-red-600)" icon={<CloudOutlined />} iconTone="cyan" />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        <Col span={24}>
          <VwCard size="small" title="PUE by site — against each facility type's target">
            <Table size="small" rowKey="key" pagination={false} dataSource={sites} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }}
              onRow={(r) => ({ onClick: () => navigate(`/facility/dc/${r.id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Site', dataIndex: 'name', render: (n: string, r) => <div><Text strong>{n}</Text><div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.typeName} · {r.cooling}</div></div> },
                { title: 'IT load', dataIndex: 'itKw', width: 100, align: 'right', render: (v: number) => `${v.toLocaleString()} kW` },
                { title: 'PUE', dataIndex: 'pue', width: 80, render: (v: number, r) => <Text strong style={{ color: r.onTrack ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{v ? v.toFixed(2) : '—'}</Text> },
                { title: 'Target', dataIndex: 'target', width: 80, render: (v: number) => `≤ ${v.toFixed(2)}` },
                { title: 'Status', width: 110, render: (_: unknown, r) => <Tooltip title={r.onTrack ? 'At or below the target for this facility type' : `Above the ${r.target.toFixed(2)} target for a ${r.typeName}`}><span><VwChip color={r.onTrack ? 'green' : 'orange'}>{r.onTrack ? 'On track' : 'Above target'}</VwChip></span></Tooltip> },
              ]} />
          </VwCard>
        </Col>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <VwCard size="small" title="PUE trend (12 periods)" style={{ width: '100%' }}>
            <MiniArea data={pueTrend} color="var(--vw-color-green-600)" fill="rgba(22,163,74,0.12)" />
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Simulated trend ending at today's weighted PUE — bends downward as cooling optimisation lands.</Text>
          </VwCard>
        </Col>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <VwCard size="small" title="Energy breakdown (kW)" style={{ width: '100%' }}>
            <MiniBars data={[k.itLoadKw, k.coolingKw, k.lossKw, Math.round(k.facilityKw * 0.04)]}
              labels={['IT', 'Cooling', 'Loss', 'Other']} color="#0ea5e9" />
          </VwCard>
        </Col>
      </Row>

      <VwCard size="small" title="ESG scorecard" style={{ marginTop: "var(--vw-space-lg)" }}>
        <Table
          size="small"
          rowKey="metric"
          pagination={false}
          dataSource={esg}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Metric', dataIndex: 'metric' },
            { title: 'Current', dataIndex: 'value' },
            { title: 'Target', dataIndex: 'target' },
            {
              title: 'Status', dataIndex: 'status',
              render: (s: string) => <VwChip color={s === 'On track' ? 'green' : s === 'Behind' || s === 'Above target' ? 'red' : 'blue'}>{s}</VwChip>,
            },
          ]}
        />
      </VwCard>

      <DataContract
        sources={['BMS / building meters', 'Utility / PDU power feeds', 'Grid carbon-intensity provider']}
        cadence="≤ 5 min for power; daily for carbon factors"
        fields={[
          { name: 'totalFacilityKw', desc: 'whole-facility power draw (numerator of PUE)' },
          { name: 'itLoadKw', desc: 'IT load at the rack/PDU (denominator of PUE)' },
          { name: 'coolingKw', desc: 'cooling-plant power for the energy breakdown' },
          { name: 'gridCarbonFactor', desc: 'tCO₂e per MWh for the serving grid region' },
          { name: 'waterLitres', desc: 'cooling water consumption for WUE' },
          { name: 'renewablePct', desc: 'contracted/measured renewable energy share' },
        ]}
        notes={[
          'PUE is currently modelled per site from the facility type’s cooling overhead; production computes it server-side from metered facility vs IT power.',
          'Carbon + ESG figures should be auditable (source + timestamp) for compliance reporting.',
        ]}
      />
    </div>
  );
}
