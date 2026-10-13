import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography } from 'antd';
import {
  AlertOutlined, WarningOutlined, ClockCircleOutlined, SafetyCertificateOutlined,
  ThunderboltOutlined, CloudOutlined, ApiOutlined, DatabaseOutlined, DashboardOutlined,
} from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { VwChip, EntityIconCell, type EntityIconTone } from '../../../shared/components/ux';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { incidentStats, slaState, fmtDuration, SEV_COLOR, PRIORITY_COLOR } from '../../operations/lib/sla';
import type { Incident } from '../../../mock/data/types';
const { Text } = Typography;

// Incident `type` values (seed.ts): Power | Cooling | Network | Rack | Capacity.
const TYPE_ICON: Record<string, { icon: ReactNode; tone: EntityIconTone }> = {
  Power: { icon: <ThunderboltOutlined />, tone: 'warning' },
  Cooling: { icon: <CloudOutlined />, tone: 'cyan' },
  Network: { icon: <ApiOutlined />, tone: 'info' },
  Rack: { icon: <DatabaseOutlined />, tone: 'purple' },
  Capacity: { icon: <DashboardOutlined />, tone: 'orange' },
};

// Status tones follow the incident lifecycle: red while unresolved and
// unattended, cooling to blue/green as it's worked and closed out.
const STATUS_COLOR: Record<string, string> = {
  Open: 'error', Investigating: 'warning', Mitigated: 'processing', Resolved: 'success', Closed: 'default',
};

export default function IncidentListPage() {
  const navigate = useNavigate();
  const all = (useEntityList('incidents', { pageSize: 500 }).data?.data ?? []) as unknown as Incident[];
  const m = useMemo(() => incidentStats(all), [all]);
  const columns: TableColumnType<Incident>[] = [
    { title: 'Status', dataIndex: 'status', width: 116, render: (s: string) => <VwChip color={STATUS_COLOR[s]}>{s}</VwChip> },
    { title: 'ID', dataIndex: 'incId', width: 96 },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    {
      title: 'Type', dataIndex: 'type', width: 130, render: (t: string) => {
        const cfg = TYPE_ICON[t];
        return cfg ? <EntityIconCell icon={cfg.icon} iconTone={cfg.tone} label={t} /> : <VwChip>{t}</VwChip>;
      },
    },
    { title: 'Sev', dataIndex: 'severity', width: 64, render: (s: string) => <VwChip color={SEV_COLOR[s]}>{s}</VwChip> },
    { title: 'Pri', dataIndex: 'priority', width: 54, render: (p: string) => p ? <VwChip color={PRIORITY_COLOR[p]}>{p}</VwChip> : '—' },
    {
      title: 'SLA', key: 'sla', width: 116, render: (_: unknown, r: Incident) => {
        const st = slaState(r);
        if (['Resolved', 'Closed'].includes(r.status)) return <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{st.resolveBreached ? 'breached' : 'met'}</Text>;
        return st.resolveBreached
          ? <Text strong style={{ color: 'var(--vw-color-red-600)' }}>Overdue {fmtDuration(st.resolveRemainingMins)}</Text>
          : <Text style={{ color: st.resolveRemainingMins < 60 ? 'var(--vw-color-orange-700)' : '#515151' }}>{fmtDuration(st.resolveRemainingMins)} left</Text>;
      },
    },
    { title: 'Owner', dataIndex: 'assignee', width: 120, render: (a: string) => a ?? <Text type="secondary">—</Text> },
    { title: 'Detected', dataIndex: 'detectedAt', width: 130, render: (d: string) => d?.slice(0, 16).replace('T', ' ') },
  ];
  return (
    <div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <KPICard title="Open incidents" value={m.open} icon={<AlertOutlined />} iconTone="error" />
        <KPICard title="SLA breaching" value={m.breaching} color={m.breaching ? 'var(--vw-color-red-600)' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Mean MTTR" value={m.mttrMins != null ? fmtDuration(m.mttrMins) : '—'} icon={<ClockCircleOutlined />} iconTone="cyan" />
        <KPICard title="SLA compliance" value={`${m.slaCompliancePct}%`} color={m.slaCompliancePct >= 90 ? 'var(--vw-color-green-600)' : m.slaCompliancePct >= 75 ? 'var(--vw-color-orange-700)' : 'var(--vw-color-red-600)'} icon={<SafetyCertificateOutlined />} iconTone="success" />
      </div>
      <EntityListPage<Incident> title="Incidents" entityType="incidents" columns={columns} onRowClick={(i) => navigate(`/incidents/${i.id}`)} searchPlaceholder="Search incidents..." headerExtra={<PageDcScopeSelect />}
        tabs={[{ key: 'open', label: 'Open', filters: [{ field: 'status', operator: 'in', value: ['Open', 'Investigating', 'Mitigated'] }] }, { key: 'sev1', label: 'SEV1', filters: [{ field: 'severity', operator: 'eq', value: 'SEV1' }] }, { key: 'all', label: 'All' }]} />
    </div>
  );
}
