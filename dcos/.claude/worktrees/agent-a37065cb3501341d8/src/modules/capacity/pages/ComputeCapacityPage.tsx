import { Progress, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { CloudServerOutlined, DesktopOutlined, DatabaseOutlined } from '../../../shared/icons';
import { useNavigate } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import type { ComputeResource } from '../../../mock/data/types';
import { VwCard } from '../../../shared/components/ux';
const { Text } = Typography;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const p = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);

export default function ComputeCapacityPage() {
  const navigate = useNavigate();
  const dcFScope = useDcFilter('scopeId');
  const comp = (useEntityList('computeResources', { pageSize: 200, filters: dcFScope }).data?.data ?? []) as unknown as ComputeResource[];
  const gpuU = sum(comp.map((c) => c.gpuCountUsed)), gpuT = sum(comp.map((c) => c.gpuCountTotal));
  const cpuU = sum(comp.map((c) => c.cpuCoresUsed)), cpuT = sum(comp.map((c) => c.cpuCoresTotal));
  const memU = sum(comp.map((c) => c.memoryGbUsed)), memT = sum(comp.map((c) => c.memoryGbTotal));
  const stoU = sum(comp.map((c) => c.storageTbUsed)), stoT = sum(comp.map((c) => c.storageTbTotal));
  const bar = (label: string, u: number, t: number, unit: string, color?: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--vw-font-label-md)" }}><span>{label}</span><Text type="secondary">{u.toLocaleString()}/{t.toLocaleString()} {unit}</Text></div>
      <Progress percent={p(u, t)} strokeColor={color} />
    </div>
  );
  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Compute &amp; GPU Capacity</div>
        <Button type="primary" onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Add ${Math.round(gpuT * 0.2)} GPUs of compute capacity as a GPU pod`)}`)}>Raise capacity plan</Button>
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="GPU Utilization" value={p(gpuU, gpuT)} suffix="%" color="#7c3aed" icon={<CloudServerOutlined />} iconTone="purple" />
        <KPICard title="GPU Slots Free" value={gpuT - gpuU} icon={<CloudServerOutlined />} iconTone="info" />
        <KPICard title="CPU Cores Free" value={(cpuT - cpuU).toLocaleString()} icon={<DesktopOutlined />} iconTone="cyan" />
        <KPICard title="Storage Free" value={(stoT - stoU).toLocaleString()} suffix=" TB" icon={<DatabaseOutlined />} iconTone="orange" />
      </div>
      <VwCard size="small" title="Estate compute pools">
        {bar('GPU', gpuU, gpuT, 'GPUs', '#7c3aed')}
        {bar('CPU cores', cpuU, cpuT, 'cores')}
        {bar('Memory', memU, memT, 'GB')}
        {bar('Storage', stoU, stoT, 'TB')}
      </VwCard>
    </div>
  );
}
