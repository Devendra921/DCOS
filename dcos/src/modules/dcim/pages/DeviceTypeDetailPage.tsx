import { useState } from 'react';
import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { DcimDeviceType, ComponentTemplate, PlatformEntity } from '../../../mock/data/types';
import { ComponentTemplateTab } from '../components/ComponentTemplateTab';

type TabId = 'info' | 'interface' | 'console' | 'power-port' | 'power-outlet' | 'module-bay' | 'pass';

export default function DeviceTypeDetailPage() {
  const { dtId } = useParams();
  const [tab, setTab] = useState<TabId>('info');
  const types = (useEntityList('deviceTypes', { pageSize: 300 }).data?.data ?? []) as unknown as DcimDeviceType[];
  const templates = (useEntityList('componentTemplates', { pageSize: 2000 }).data?.data ?? []) as unknown as ComponentTemplate[];
  const platforms = (useEntityList('platforms', { pageSize: 200 }).data?.data ?? []) as unknown as PlatformEntity[];
  const dt = types.find((t) => t.id === dtId);
  if (!dt) return <PageEmptyState title="Device type not found" />;
  const mine = templates.filter((t) => t.deviceTypeId === dt.id);
  const has = (k: string) => mine.some((t) => t.kind === k);
  const countOf = (kinds: string[]) => mine.filter((t) => kinds.includes(t.kind)).length;

  type Kinds = Parameters<typeof ComponentTemplateTab>[0]['kinds'];
  type KindDefault = Parameters<typeof ComponentTemplateTab>[0]['addKindDefault'];
  const TEMPLATE_TABS: { id: Exclude<TabId, 'info'>; label: string; kinds: Kinds; def: KindDefault }[] = [
    { id: 'interface', label: 'Interface template', kinds: ['interface'], def: 'interface' },
    { id: 'console', label: 'Console port template', kinds: ['console', 'console-server'], def: 'console' },
    { id: 'power-port', label: 'Power port template', kinds: ['power-port'], def: 'power-port' },
    { id: 'power-outlet', label: 'Power outlet template', kinds: ['power-outlet'], def: 'power-outlet' },
    { id: 'module-bay', label: 'Chassis template', kinds: ['module-bay'], def: 'module-bay' },
  ];
  if (has('front-port') || has('rear-port')) {
    TEMPLATE_TABS.push({ id: 'pass', label: 'Pass-through ports', kinds: ['front-port', 'rear-port'], def: 'front-port' });
  }
  const current = TEMPLATE_TABS.find((t) => t.id === tab);
  const platformName = platforms.find((p) => p.id === dt.defaultPlatformId)?.name ?? dt.platform ?? '—';

  return (
    <OpsPage title={<>{dt.manufacturer} {dt.model}</>} description={dt.description}
      actions={<>
        <Chip tone="info">{dt.role}</Chip>
        {dt.platform && <Chip tone="neutral">{dt.platform}</Chip>}
        <Chip tone="neutral">{dt.uHeight}U</Chip>
      </>}>
      <StatGrid cols={4}>
        <StatTile label="Height" value={<>{dt.uHeight}<small> U</small></>} sub={dt.isFullDepth ? 'full depth' : 'half depth'} />
        <StatTile label="Component templates" value={mine.length} sub={`${countOf(['interface'])} interface · ${countOf(['power-port'])} power port`} />
        <StatTile label="Weight" value={dt.weight != null ? <>{dt.weight}<small> {dt.weightUnit ?? ''}</small></> : '—'} sub={dt.airflow ?? 'airflow not set'} />
        <StatTile label="Platform" value={platformName} sub={dt.excludeFromUtilization ? 'excluded from utilization' : 'counts toward utilization'} />
      </StatGrid>

      <Tabs<TabId> value={tab} onChange={setTab} tabs={[
        { id: 'info', label: 'Device type' },
        ...TEMPLATE_TABS.map((t) => ({ id: t.id, label: t.label, count: countOf(t.kinds) })),
      ]} />

      {tab === 'info' && (
        <Panel title="Device type" icon={Info}>
          <KV cols={3} items={[
            ['Manufacturer', dt.manufacturer],
            ['Model', dt.model],
            ['Slug', dt.slug ?? '—'],
            ['Default platform', platformName],
            ['Subdevice role', dt.subdeviceRole ? <Chip tone={dt.subdeviceRole === 'parent' ? 'warning' : 'cyan'}>{dt.subdeviceRole}</Chip> : '—'],
            ['Role', <Chip tone="neutral">{dt.role}</Chip>],
            ['Part number', dt.partNumber ?? '—'],
            ['Height (U)', dt.uHeight],
            ['Full depth', dt.isFullDepth ? 'Yes' : 'No'],
            ['Airflow', dt.airflow ?? '—'],
            ['Exclude from utilization', dt.excludeFromUtilization ? 'Yes' : 'No'],
            ['Weight', dt.weight != null ? `${dt.weight} ${dt.weightUnit ?? ''}` : '—'],
            ['Description', dt.description ?? '—'],
          ]} />
        </Panel>
      )}
      {current && (
        <Panel title={current.label} count={countOf(current.kinds)}>
          <ComponentTemplateTab owner={{ deviceTypeId: dt.id }} kinds={current.kinds} addKindDefault={current.def} templates={mine} />
        </Panel>
      )}
    </OpsPage>
  );
}
