import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ThunderboltOutlined, CloudOutlined, ApiOutlined, DatabaseOutlined, DashboardOutlined,
} from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { EntityIconCell, type EntityIconTone } from '../../../shared/components/ux';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { incidentStats, slaState, fmtDuration } from '../../operations/lib/sla';
import type { Incident } from '../../../mock/data/types';

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
const STATUS_TONE: Record<string, Tone> = {
  Open: 'error', Investigating: 'warning', Mitigated: 'info', Resolved: 'success', Closed: 'neutral',
};
const SEV_TONE: Record<string, Tone> = { SEV1: 'error', SEV2: 'orange', SEV3: 'neutral', SEV4: 'neutral' };
const PRI_TONE: Record<string, Tone> = { P1: 'error', P2: 'orange', P3: 'neutral', P4: 'neutral' };

export default function IncidentListPage() {
  const navigate = useNavigate();
  const all = (useEntityList('incidents', { pageSize: 500 }).data?.data ?? []) as unknown as Incident[];
  const m = useMemo(() => incidentStats(all), [all]);
  const columns: TableColumnType<Incident>[] = [
    { title: 'Status', dataIndex: 'status', width: 116, render: (s: string) => <Chip tone={STATUS_TONE[s] ?? 'neutral'} dot>{s}</Chip> },
    {
      title: 'Incident', dataIndex: 'incId', width: 96,
      render: (id: string, r: Incident) => <span className="cell-2"><span className="vw-card-activity-label">{id}</span><small>{r.title}</small></span>,
    },
    {
      title: 'Type', dataIndex: 'type', width: 130, render: (t: string) => {
        const cfg = TYPE_ICON[t];
        return cfg ? <EntityIconCell icon={cfg.icon} iconTone={cfg.tone} label={t} /> : <Chip>{t}</Chip>;
      },
    },
    { title: 'Sev', dataIndex: 'severity', width: 64, render: (s: string) => <Chip tone={SEV_TONE[s] ?? 'neutral'}>{s}</Chip> },
    { title: 'Pri', dataIndex: 'priority', width: 54, render: (p: string) => p ? <Chip tone={PRI_TONE[p] ?? 'neutral'}>{p}</Chip> : '—' },
    {
      title: 'SLA', key: 'sla', width: 116, render: (_: unknown, r: Incident) => {
        const st = slaState(r);
        if (['Resolved', 'Closed'].includes(r.status)) return <span className="vw-label">{st.resolveBreached ? 'breached' : 'met'}</span>;
        return st.resolveBreached
          ? <b style={{ color: 'var(--vw-color-red-600)' }}>Overdue {fmtDuration(st.resolveRemainingMins)}</b>
          : <span style={{ color: st.resolveRemainingMins < 60 ? 'var(--vw-color-orange-700)' : undefined }}>{fmtDuration(st.resolveRemainingMins)} left</span>;
      },
    },
    { title: 'Owner', dataIndex: 'assignee', width: 120, render: (a: string) => a ?? <span className="vw-label">—</span> },
    { title: 'Detected', dataIndex: 'detectedAt', width: 130, render: (d: string) => <span className="num">{d?.slice(0, 16).replace('T', ' ')}</span> },
  ];
  const complianceTone: Tone = m.slaCompliancePct >= 90 ? 'success' : m.slaCompliancePct >= 75 ? 'warning' : 'error';
  return (
    <OpsPage title="Incidents" description="Operational incidents across the estate — what is open, SLA exposure and time to resolve">
      <StatGrid cols={4}>
        <StatTile label="Open incidents" value={m.open} sub={m.open ? 'not yet resolved' : 'none open'} subTone={m.open ? 'warn' : undefined} />
        <StatTile label="SLA breaching" value={m.breaching} sub={m.breaching ? 'open and in SLA breach' : 'none breaching'} subTone={m.breaching ? 'bad' : undefined} />
        <StatTile label="Mean MTTR" value={m.mttrMins != null ? fmtDuration(m.mttrMins) : '—'} sub="resolved incidents" />
        <StatTile label="SLA compliance" value={<>{m.slaCompliancePct}<small>%</small></>} sub="resolved within target">
          <SoftMeter pct={m.slaCompliancePct} tone={complianceTone} />
        </StatTile>
      </StatGrid>
      <EntityListPage<Incident> title="Incidents" entityType="incidents" columns={columns} onRowClick={(i) => navigate(`/incidents/${i.id}`)} searchPlaceholder="Search incidents..." headerExtra={<PageDcScopeSelect />}
        tabs={[{ key: 'open', label: 'Open', filters: [{ field: 'status', operator: 'in', value: ['Open', 'Investigating', 'Mitigated'] }] }, { key: 'sev1', label: 'SEV1', filters: [{ field: 'severity', operator: 'eq', value: 'SEV1' }] }, { key: 'all', label: 'All' }]} />
    </OpsPage>
  );
}
