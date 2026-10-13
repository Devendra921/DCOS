import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { App } from 'antd';
import { useParams } from 'react-router-dom';
import { Grid3x3, History, Info, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, KV, Panel } from '../../../ops/ui/kit';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { IpGrid } from '../components/IpGrid';
import { EntityAuditTab } from '../../../shared/components/detail';
import { useAllocateIp, nextAvailableAddress } from '../lib/useIpam';
import type { Subnet, IPAddress } from '../../../mock/data/types';

export default function SubnetDetailPage() {
  const { subnetId } = useParams();
  const { message } = App.useApp();
  const allocate = useAllocateIp();
  const { data } = useEntityDetail('subnets', subnetId);
  const ipsRes = useEntityList('ipAddresses', { filters: [{ field: 'subnetId', operator: 'eq', value: subnetId }], pageSize: 1000 });
  const s = data as unknown as Subnet | null;
  const ips = (ipsRes.data?.data ?? []) as unknown as IPAddress[];
  if (!s) return <PageEmptyState title="Prefix not found" />;

  const isContainer = s.status === 'Container';
  const next = isContainer ? null : nextAvailableAddress(s, ips);
  const onAllocate = () => {
    allocate(s, ips)
      .then((rec) => message.success(`Allocated ${rec.address}`))
      .catch((e) => message.warning(e.message));
  };
  const hot = s.utilizationPct >= 85;

  return (
    <OpsPage title={s.cidr} description={s.name}
      actions={<><Chip tone="neutral">{s.purpose}</Chip>
        <Chip tone={s.state === 'Consumed' ? 'error' : s.state === 'Committed' ? 'warning' : 'success'} dot>{s.state}</Chip></>}>

      <StatGrid cols={4}>
        <StatTile label="Hosts used" value={<>{s.usedHosts}<small> / {s.totalHosts}</small></>} sub="addresses in use" />
        <StatTile label="Utilization" value={<>{s.utilizationPct}<small>%</small></>} sub={hot ? 'near exhaustion' : 'of prefix'} subTone={hot ? 'bad' : undefined}>
          <SoftMeter pct={s.utilizationPct} tone={hot ? 'error' : 'info'} />
        </StatTile>
        <StatTile label="IP records" value={ips.length} sub="allocated in this prefix" />
        <StatTile label="Forecast exhaustion" value={s.forecastExhaustionDate ? s.forecastExhaustionDate.slice(0, 10) : '—'} sub="at current growth" />
      </StatGrid>

      <div className="grid g-main-side">
        <Panel title={`IP allocation (${ips.length})`} icon={Grid3x3}
          actions={!isContainer && (
            <Btn variant="filled" icon={Zap} disabled={!next} onClick={onAllocate}>
              {next ? `Allocate ${next}` : 'Prefix full'}
            </Btn>
          )}>
          <IpGrid ips={ips} />
        </Panel>
        <Panel title="Overview" icon={Info}>
          <KV cols={1} items={[
            ['Name', s.name],
            ['Gateway', <span className="mono">{s.gatewayIp}</span>],
            ['Hosts', `${s.usedHosts}/${s.totalHosts}`],
            ['Utilization', <Meter pct={s.utilizationPct} width={120} />],
            ['Forecast exhaustion', s.forecastExhaustionDate ? s.forecastExhaustionDate.slice(0, 10) : '—'],
          ]} />
        </Panel>
      </div>

      <Panel title="Activity" icon={History}><EntityAuditTab entityType="Subnet" entityId={s.subnetId} /></Panel>
    </OpsPage>
  );
}
