import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Typography, Empty, Space, Descriptions, Tooltip } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined, ApartmentOutlined, HomeOutlined, DashboardOutlined, CloudServerOutlined, EditOutlined } from '../../../shared/icons';
import { EntityCustomizeCard } from '../../../shared/customization';
import { DataCenterFormModal } from '../components/DataCenterFormModal';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import type { DataCenter, Hall, Rack, CoolingZone } from '../../../mock/data/types';
import { dcTypeProfile, fmtRange, fmtPowerRange, coverageChipColor, CAPABILITY_GAP_LABEL, dcTypeFit, capacityThresholds, pueFor, pueTargetFor, type FitBand } from '../../../mock/data/dcTypes';

const { Text } = Typography;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export default function DataCenterDrillPage() {
  const { dcId } = useParams();
  const navigate = useNavigate();
  const { data } = useEntityDetail('dataCenters', dcId);
  const halls = (useEntityList('halls', { filters: [{ field: 'dataCenterId', operator: 'eq', value: dcId }], pageSize: 200 }).data?.data ?? []) as unknown as Hall[];
  const racks = (useEntityList('racks', { filters: [{ field: 'dataCenterId', operator: 'eq', value: dcId }], pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const d = data as unknown as DataCenter | null;
  const zones = (useEntityList('coolingZones', { filters: [{ field: 'dataCenterId', operator: 'eq', value: dcId }], pageSize: 100 }).data?.data ?? []) as unknown as CoolingZone[];
  const [editOpen, setEditOpen] = useState(false);
  const k = useMemo(() => ({
    avgPower: racks.length ? Math.round(racks.reduce((s, r) => s + r.powerUtilizationPct, 0) / racks.length) : 0,
    headroom: Math.round(racks.reduce((s, r) => s + (r.maxPowerKw - r.currentPowerKw), 0)),
    gpu: racks.filter((r) => r.purpose === 'GPU').length,
    itKw: racks.reduce((s, r) => s + r.currentPowerKw, 0),
  }), [racks]);
  const coolKw = zones.reduce((s, z) => s + z.currentLoadKw, 0);
  const pue = pueFor(d?.dcTypeKey, k.itKw, coolKw);
  const pueTarget = pueTargetFor(d?.dcTypeKey);
  const thresholds = capacityThresholds(d?.dcTypeKey);
  const dcType = dcTypeProfile(d?.dcTypeKey);
  // Profile fit: does this site sit inside its type's typical envelope? Power and density are the
  // meaningful checks; rack count is shown for context (a prototype estate samples big types small).
  const fit = useMemo(() => {
    if (!dcType || !d) return null;
    const avgMaxKwPerRack = racks.length ? racks.reduce((s, r) => s + r.maxPowerKw, 0) / racks.length : 0;
    return { ...dcTypeFit(dcType, { racks: racks.length, designPowerKw: d.designPowerKw, avgMaxKwPerRack }), avgMaxKwPerRack };
  }, [dcType, d, racks]);
  const fitChip = (band: FitBand, label: string) => band === 'n/a' ? null : (
    <VwChip color={band === 'within' ? 'success' : 'warning'}>{label}: {band === 'within' ? 'within band' : `${band} band`}</VwChip>
  );
  if (!d) return <div><Empty description="Data center not found" /></div>;

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/map')}>Map</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{d.name}</div>
        {dcType && <VwChip color="blue">{dcType.name}</VwChip>}<VwChip>{d.tier}</VwChip><VwChip>{d.status}</VwChip>
        <Button size="small" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>Edit</Button>
        <Button size="small" type="primary" onClick={() => navigate(`/facility/dc/${d.id}/site360`)}>Site 360</Button>
      </Space>
      <DataCenterFormModal open={editOpen} onClose={() => setEditOpen(false)} dc={d} />
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Racks" value={racks.length} icon={<ApartmentOutlined />} iconTone="info" />
        <KPICard title="Halls" value={halls.length} icon={<HomeOutlined />} iconTone="cyan" />
        <KPICard title="Avg Power Utilization" value={k.avgPower} suffix="%" color={k.avgPower >= 85 ? 'var(--vw-color-red-600)' : undefined} icon={<DashboardOutlined />} iconTone="warning" />
        <KPICard title="GPU Racks" value={k.gpu} icon={<CloudServerOutlined />} iconTone="purple" />
      </div>
      {dcType && (
        <VwCard size="small" style={{ marginBottom: "var(--vw-space-lg)" }}
          title={<span>Facility profile — {dcType.name} <VwChip color={dcType.segment === 'Telco' ? 'purple' : 'blue'} style={{ marginLeft: 6 }}>{dcType.segment}</VwChip></span>}
          extra={<Tooltip title={dcType.gaps.length ? `To close: ${dcType.gaps.map((g) => CAPABILITY_GAP_LABEL[g]).join(' · ')}` : 'Core supported use case'}><span><VwChip color={coverageChipColor(dcType.coverage)}>DCOS coverage: {dcType.coverage}</VwChip></span></Tooltip>}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>{dcType.description}</Text>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Typical size">{fmtRange(dcType.typicalRacks)} racks</Descriptions.Item>
            <Descriptions.Item label="Power envelope">{fmtPowerRange(dcType.powerKw)}</Descriptions.Item>
            <Descriptions.Item label="Density">{dcType.kwPerRack ? `${dcType.kwPerRack[0]}–${dcType.kwPerRack[1]} kW/rack` : 'n/a'}</Descriptions.Item>
            <Descriptions.Item label="Cooling">{dcType.cooling}</Descriptions.Item>
            <Descriptions.Item label="Redundancy / Tier">{dcType.redundancy}</Descriptions.Item>
            <Descriptions.Item label="Design power">{d.designPowerKw.toLocaleString()} kW</Descriptions.Item>
            <Descriptions.Item label="Design cooling">{d.designCoolingKw.toLocaleString()} kW</Descriptions.Item>
            <Descriptions.Item label="Traits">{[dcType.multiTenant && 'Multi-tenant', dcType.dcPowerPlant && '−48V DC plant', dcType.highDensity && 'High density'].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="Capacity policy">warn ≥ {thresholds.rackPowerWarnPct}% · block ≥ {thresholds.rackPowerBlockPct}% · cooling floor {thresholds.coolingHeadroomMinPct}%</Descriptions.Item>
            <Descriptions.Item label="PUE"><Text strong style={{ color: pue <= pueTarget ? 'var(--vw-color-green-600)' : 'var(--vw-color-orange-700)' }}>{pue || '—'}</Text> <Text type="secondary">target ≤ {pueTarget}</Text></Descriptions.Item>
            <Descriptions.Item label="Build blueprint">{dcType.build.blueprintKey}</Descriptions.Item>
            <Descriptions.Item label="Programme budget">${(dcType.build.defaultBudget / 1e6).toFixed(0)}M default</Descriptions.Item>
          </Descriptions>
          {fit && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Profile fit:</Text>
              {fitChip(fit.power, `Design power ${d.designPowerKw.toLocaleString()} kW`)}
              {fitChip(fit.density, `Density ${fit.avgMaxKwPerRack.toFixed(1)} kW/rack`)}
              <VwChip>{racks.length} racks · typical {fmtRange(dcType.typicalRacks)}</VwChip>
              <VwChip>{dcType.physical.redundancy} · {dcType.physical.containment === 'None' ? 'no containment' : dcType.physical.containment.toLowerCase()} · {dcType.physical.rackHeightU}U racks</VwChip>
            </div>
          )}
        </VwCard>
      )}
      <div style={{ marginBottom: "var(--vw-space-lg)" }}><EntityCustomizeCard entityType="dataCenters" record={d} /></div>
      <VwCard size="small" title="Halls" extra={<Button type="link" onClick={() => navigate('/facility/racks')}>All racks →</Button>}>
        <div className="vw-grid vw-grid-cols-auto-320 vw-gap-lg">
          {halls.map((h) => (
            <VwCard key={h.id} hoverable size="small" onClick={() => navigate(`/facility/hall/${h.id}`)}>
              <Text strong>{h.name}</Text>
              <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", marginTop: "var(--vw-space-xxs)" }}>{h.gridCols}×{h.gridRows} · {h.rackCount}/{h.rackCapacity} racks</div>
              <VwChip style={{ marginTop: "var(--vw-space-sm)" }} color={h.utilizationPct >= 85 ? 'red' : h.utilizationPct >= 60 ? 'orange' : 'green'}>{h.utilizationPct}% full</VwChip>
            </VwCard>
          ))}
        </div>
      </VwCard>
    </div>
  );
}
