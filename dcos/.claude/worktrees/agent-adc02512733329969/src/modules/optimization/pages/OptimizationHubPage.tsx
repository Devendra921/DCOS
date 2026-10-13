import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { BulbOutlined, DashboardOutlined, ApiOutlined, WarningOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Rack, VLAN, Subnet, Device, DataCenter } from '../../../mock/data/types';
import { dcTypeProfile, dcTypeFit, fmtPowerRange } from '../../../mock/data/dcTypes';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

interface Finding { key: string; category: string; resource: string; recommendation: string; saving: string; sev: 'High' | 'Medium' | 'Low'; to?: string }

export default function OptimizationHubPage() {
  const navigate = useNavigate();
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const vlans = (useEntityList('vlans', { pageSize: 500 }).data?.data ?? []) as unknown as VLAN[];
  const subnets = (useEntityList('subnets', { pageSize: 500 }).data?.data ?? []) as unknown as Subnet[];
  const assets = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];

  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];
    racks.filter((r) => r.powerUtilizationPct < 25 && r.usedU > 0).slice(0, 8).forEach((r) =>
      out.push({ key: 'ur-' + r.id, category: 'Underutilized rack', resource: r.name, recommendation: `Consolidate — only ${r.powerUtilizationPct}% power used`, saving: `${Math.round(r.maxPowerKw - r.currentPowerKw)} kW reclaimable`, sev: 'Medium', to: `/facility/racks/${r.id}` }));
    racks.filter((r) => r.purpose === 'GPU' && !r.liquidCoolingReady).slice(0, 6).forEach((r) =>
      out.push({ key: 'lc-' + r.id, category: 'Cooling readiness', resource: r.name, recommendation: 'GPU rack lacks liquid-cooling readiness for >40 kW density', saving: 'Density constraint', sev: 'High', to: `/facility/racks/${r.id}` }));
    const unused = vlans.filter((v) => v.status === 'Unused');
    if (unused.length) out.push({ key: 'vlan', category: 'Network optimization', resource: `${unused.length} VLANs`, recommendation: 'Reclaim unused VLAN IDs', saving: `${unused.length} IDs`, sev: 'Low', to: '/ipam/vlans' });
    subnets.filter((s) => s.utilizationPct >= 85).slice(0, 5).forEach((s) =>
      out.push({ key: 'sn-' + s.id, category: 'Subnet exhaustion', resource: s.cidr, recommendation: `${s.utilizationPct}% used — plan expansion`, saving: 'Avoid outage', sev: 'High', to: `/ipam/subnets/${s.id}` }));
    // Profile fit: a site running outside its type's density or power envelope is either mis-classified or under-provisioned.
    dcs.forEach((d) => {
      const t = dcTypeProfile(d.dcTypeKey); if (!t) return;
      const rk = racks.filter((r) => r.dataCenterId === d.id);
      const avg = rk.length ? rk.reduce((s, r) => s + r.maxPowerKw, 0) / rk.length : 0;
      const fit = dcTypeFit(t, { racks: rk.length, designPowerKw: d.designPowerKw, avgMaxKwPerRack: avg });
      if (fit.density === 'above') out.push({ key: 'fit-d-' + d.id, category: 'Profile fit', resource: d.name, recommendation: `Density ${avg.toFixed(1)} kW/rack is above the ${t.name} band (${t.kwPerRack?.[0]}–${t.kwPerRack?.[1]}) — upgrade cooling or reclassify the site`, saving: 'Thermal risk', sev: 'High', to: `/facility/dc/${d.id}` });
      if (fit.power !== 'within') out.push({ key: 'fit-p-' + d.id, category: 'Profile fit', resource: d.name, recommendation: `Design power ${d.designPowerKw.toLocaleString()} kW is ${fit.power} the ${t.name} envelope (${fmtPowerRange(t.powerKw)})`, saving: fit.power === 'below' ? 'Stranded capacity risk' : 'Reclassify', sev: 'Medium', to: `/facility/dc/${d.id}` });
    });
    const idle = assets.filter((a) => ['Retired', 'Disposed'].includes(a.lifecycleState ?? '') && a.rackId).length;
    if (idle) out.push({ key: 'idle', category: 'Idle assets', resource: `${idle} devices`, recommendation: 'Retired/disposed devices still occupying rack U', saving: 'Reclaim U + power', sev: 'Medium', to: '/facility/devices' });
    return out;
  }, [racks, vlans, subnets, assets, dcs]);

  const byCat = (c: string) => findings.filter((f) => f.category === c).length;
  const sevColor: Record<string, string> = { High: 'red', Medium: 'orange', Low: 'blue' };
  const findingsReveal = useScrollReveal(findings, 25);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Optimization</div>
        </div>
        <PageDcScopeSelect />
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Total Findings" value={findings.length} icon={<BulbOutlined />} iconTone="info" />
        <KPICard title="Capacity" value={byCat('Underutilized rack') + byCat('Idle assets')} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Network" value={byCat('Network optimization') + byCat('Subnet exhaustion')} icon={<ApiOutlined />} iconTone="purple" />
        <KPICard title="High Priority" value={findings.filter((f) => f.sev === 'High').length} color="var(--vw-color-red-600)" icon={<WarningOutlined />} iconTone="error" />
      </div>
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Optimization findings</div>
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {findingsReveal.visible.length} of {findingsReveal.total} findings
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<Finding> size="small" rowKey="key" dataSource={findingsReveal.visible} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
          onRow={(f) => ({ onClick: () => f.to && navigate(f.to), style: { cursor: f.to ? 'pointer' : 'default' } })}
          columns={[
            { title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> },
            { title: 'Resource', dataIndex: 'resource' },
            { title: 'Recommendation', dataIndex: 'recommendation' },
            { title: 'Opportunity', dataIndex: 'saving' },
            { title: 'Priority', dataIndex: 'sev', render: (s: string) => <VwChip color={sevColor[s]}>{s}</VwChip> },
          ]} />
        {findingsReveal.visible.length > 0 && findingsReveal.hasMore && (
          <div ref={findingsReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
            <Spin size="small" />
          </div>
        )}
      </VwCard>
    </div>
  );
}
