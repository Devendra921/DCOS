import { useParams, useNavigate } from 'react-router-dom';
import { Descriptions, Empty, Space, Tabs } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ArrowLeftOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { DcimDeviceType, ComponentTemplate, PlatformEntity } from '../../../mock/data/types';
import { ComponentTemplateTab } from '../components/ComponentTemplateTab';
import { VwCard, VwChip } from '../../../shared/components/ux';

export default function DeviceTypeDetailPage() {
  const { dtId } = useParams();
  const navigate = useNavigate();
  const types = (useEntityList('deviceTypes', { pageSize: 300 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 2000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const platforms = (useEntityList('platforms', { pageSize: 200 }).data?.data ?? []) as unknown as PlatformEntity[];
  const dt = types.find((t) => t.id === dtId);
  if (!dt) return <div><Empty description="Device type not found" /></div>;
  const mine = templates.filter((t) => t.deviceTypeId === dt.id);
  const has = (k: string) => mine.some((t) => t.kind === k);

  const tab = (kinds: Parameters<typeof ComponentTemplateTab>[0]['kinds'], def: Parameters<typeof ComponentTemplateTab>[0]['addKindDefault']) =>
    <ComponentTemplateTab owner={{ deviceTypeId: dt.id }} kinds={kinds} addKindDefault={def} templates={mine} />;

  const items = [
    {
      key: 'info', label: 'Device type', children: (
        <VwCard size="small">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Manufacturer">{dt.manufacturer}</Descriptions.Item>
            <Descriptions.Item label="Model">{dt.model}</Descriptions.Item>
            <Descriptions.Item label="Slug">{dt.slug ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Default platform">{platforms.find((p) => p.id === dt.defaultPlatformId)?.name ?? dt.platform ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Subdevice role">{dt.subdeviceRole ? <VwChip color={dt.subdeviceRole === 'parent' ? 'gold' : 'cyan'}>{dt.subdeviceRole}</VwChip> : '—'}</Descriptions.Item>
            <Descriptions.Item label="Role"><VwChip>{dt.role}</VwChip></Descriptions.Item>
            <Descriptions.Item label="Part number">{dt.partNumber ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Height (U)">{dt.uHeight}</Descriptions.Item>
            <Descriptions.Item label="Full depth">{dt.isFullDepth ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Airflow">{dt.airflow ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Exclude from utilization">{dt.excludeFromUtilization ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Weight">{dt.weight != null ? `${dt.weight} ${dt.weightUnit ?? ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Description">{dt.description ?? '—'}</Descriptions.Item>
          </Descriptions>
        </VwCard>
      ),
    },
    { key: 'interface', label: 'Interface template', children: tab(['interface'], 'interface') },
    { key: 'console', label: 'Console port template', children: tab(['console', 'console-server'], 'console') },
    { key: 'power-port', label: 'Power port template', children: tab(['power-port'], 'power-port') },
    { key: 'power-outlet', label: 'Power outlet template', children: tab(['power-outlet'], 'power-outlet') },
    { key: 'module-bay', label: 'Chassis template', children: tab(['module-bay'], 'module-bay') },
  ];
  if (has('front-port') || has('rear-port')) {
    items.push({ key: 'pass', label: 'Pass-through ports', children: tab(['front-port', 'rear-port'], 'front-port') });
  }

  return (
    <div>
      <Space className="vw-card-section" style={{ marginBottom: 10, width: '100%' }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/facility/device-types')}>Device types</Button>
        <div className="vw-page-title" role="heading" aria-level={4}>{dt.manufacturer} {dt.model}</div>
        <VwChip color="blue">{dt.role}</VwChip>{dt.platform && <VwChip>{dt.platform}</VwChip>}<VwChip>{dt.uHeight}U</VwChip>
      </Space>
      <Tabs items={items} />
    </div>
  );
}
