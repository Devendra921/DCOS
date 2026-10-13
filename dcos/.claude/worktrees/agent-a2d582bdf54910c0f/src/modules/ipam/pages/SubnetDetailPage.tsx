import { App, Row, Col, Descriptions, Empty, Space, Progress } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, ThunderboltOutlined } from '../../../shared/icons';
import { useEntityDetail, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { IpGrid } from '../components/IpGrid';
import { EntityAuditTab } from '../../../shared/components/detail';
import { useAllocateIp, nextAvailableAddress } from '../lib/useIpam';
import type { Subnet, IPAddress } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';

export default function SubnetDetailPage() {
  const { subnetId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const allocate = useAllocateIp();
  const { data } = useEntityDetail('subnets', subnetId);
  const ipsRes = useEntityList('ipAddresses', { filters: [{ field: 'subnetId', operator: 'eq', value: subnetId }], pageSize: 1000 });
  const s = data as unknown as Subnet | null;
  const ips = (ipsRes.data?.data ?? []) as unknown as IPAddress[];
  if (!s) return <div><Empty description="Prefix not found" /></div>;

  const isContainer = s.status === 'Container';
  const next = isContainer ? null : nextAvailableAddress(s, ips);
  const onAllocate = () => {
    allocate(s, ips)
      .then((rec) => message.success(`Allocated ${rec.address}`))
      .catch((e) => message.warning(e.message));
  };

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: "var(--vw-space-md)", width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ipam/subnets')}>Subnets</Button>
        <div className="vw-page-title" role="heading" aria-level={3}>{s.cidr}</div>
        <VwChip>{s.purpose}</VwChip>
        <VwChip color={s.state === 'Consumed' ? 'red' : s.state === 'Committed' ? 'gold' : 'green'}>{s.state}</VwChip>
      </Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10} style={{ display: 'flex' }}>
          <VwCard size="small" title="Overview" style={{ width: '100%' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Name">{s.name}</Descriptions.Item>
              <Descriptions.Item label="Gateway">{s.gatewayIp}</Descriptions.Item>
              <Descriptions.Item label="Hosts">{s.usedHosts}/{s.totalHosts}</Descriptions.Item>
              <Descriptions.Item label="Utilization"><Progress percent={s.utilizationPct} size="small" status={s.utilizationPct >= 85 ? 'exception' : 'normal'} /></Descriptions.Item>
              <Descriptions.Item label="Forecast exhaustion">{s.forecastExhaustionDate ? s.forecastExhaustionDate.slice(0, 10) : '—'}</Descriptions.Item>
            </Descriptions>
          </VwCard>
        </Col>
        <Col xs={24} lg={14} style={{ display: 'flex' }}>
          <VwCard
            size="small"
            title={`IP allocation (${ips.length})`}
            style={{ width: '100%' }}
            extra={!isContainer && (
              <Button size="small" type="primary" icon={<ThunderboltOutlined />} disabled={!next} onClick={onAllocate}>
                {next ? `Allocate ${next}` : 'Prefix full'}
              </Button>
            )}
          >
            <IpGrid ips={ips} />
          </VwCard>
        </Col>
      </Row>
      <VwCard size="small" title="Activity" style={{ marginTop: "var(--vw-space-lg)" }}><EntityAuditTab entityType="Subnet" entityId={s.subnetId} /></VwCard>
    </div>
  );
}
