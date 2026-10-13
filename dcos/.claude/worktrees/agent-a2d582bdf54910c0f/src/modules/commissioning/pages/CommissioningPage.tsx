import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Progress } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { CheckCircleOutlined, PercentageOutlined, SafetyCertificateOutlined, FileProtectOutlined } from '../../../shared/icons';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { CX_LEVEL } from '../../../mock/data/enums';
import { KPICard } from '../../../shared/components/KPICard';
import { AtpDetailDrawer } from '../../delivery/components/commissioning';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Project, Atp, AtpStep, Hoto } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const atpColor: Record<string, string> = { Draft: 'default', 'In Progress': 'gold', Witnessed: 'cyan', Accepted: 'green', Failed: 'red' };

export default function CommissioningPage() {
  const atps = (useEntityList('atps', { pageSize: 1000 }).data?.data ?? []) as unknown as Atp[];
  const atpSteps = (useEntityList('atpSteps', { pageSize: 5000 }).data?.data ?? []) as unknown as AtpStep[];
  const hotos = (useEntityList('hotos', { pageSize: 1000 }).data?.data ?? []) as unknown as Hoto[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const navigate = useNavigate();
  const [selAtp, setSelAtp] = useState<Atp | null>(null);

  const m = useMemo(() => {
    const accepted = atps.filter((a) => a.status === 'Accepted').length;
    const byLevel = CX_LEVEL.map((lvl) => { const inL = atps.filter((a) => a.level === lvl); const acc = inL.filter((a) => a.status === 'Accepted').length; return { lvl, n: inL.length, rate: inL.length ? Math.round((acc / inL.length) * 100) : 0 }; });
    const passRate = atps.length ? Math.round((accepted / atps.length) * 100) : 0;
    const hotoAccepted = hotos.filter((h) => h.status.startsWith('Accepted')).length;
    return { accepted, byLevel, passRate, hotoAccepted };
  }, [atps, hotos]);

  const stepsPass = (a: Atp) => { const ss = atpSteps.filter((s) => s.atpId === a.id); return ss.length ? Math.round((ss.filter((s) => s.result === 'Pass').length / ss.length) * 100) : 0; };
  const atpsReveal = useScrollReveal(atps, 25);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Commissioning &amp; Acceptance</div>
        <PageDcScopeSelect />
      </div>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="ATPs Accepted" value={m.accepted} suffix={`/ ${atps.length}`} color={m.accepted < atps.length ? '#f59e0b' : 'var(--vw-color-green-600)'} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="ATP Acceptance" value={m.passRate} suffix="%" icon={<PercentageOutlined />} iconTone="cyan" />
        <KPICard title="HOTO Accepted" value={m.hotoAccepted} suffix={`/ ${hotos.length}`} icon={<SafetyCertificateOutlined />} iconTone="info" />
        <KPICard title="Protocols" value={atps.length} icon={<FileProtectOutlined />} iconTone="purple" />
      </div>

      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        {m.byLevel.map((l) => (
          <VwCard size="small" bodyStyle={{ padding: "var(--vw-space-md)" }} key={l.lvl}><div style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600 }}>{l.lvl}</div><Progress percent={l.rate} size="small" /><div className="vw-card-metric-label-sm">{l.n} ATPs</div></VwCard>
        ))}
      </div>

      <VwCard size="small" title={`Acceptance test protocols (${atps.length})`}>
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
          Showing {atpsReveal.visible.length} of {atpsReveal.total} protocols
        </div>
        <VwCard variant="child" bodyStyle={{ padding: 0 }}>
          <Table<Atp> size="small" rowKey="id" dataSource={atpsReveal.visible} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
            onRow={(a) => ({ onClick: () => setSelAtp(a), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Protocol', dataIndex: 'name' },
              { title: 'Project', dataIndex: 'projectId', render: (id: string) => <a onClick={(e) => { e.stopPropagation(); navigate(`/delivery/projects/${id}`); }}>{projName[id] ?? 'Project'}</a> },
              { title: 'System', dataIndex: 'system', render: (s) => <VwChip>{s}</VwChip> },
              { title: 'Level', dataIndex: 'level', render: (l) => <VwChip color="geekblue">{l}</VwChip> },
              { title: 'Steps passed', key: 'pr', width: 160, render: (_: unknown, a) => <Progress percent={stepsPass(a)} size="small" /> },
              { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={atpColor[s]}>{s}</VwChip> },
            ]} />
          {atpsReveal.visible.length > 0 && atpsReveal.hasMore && (
            <div ref={atpsReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
              <Spin size="small" />
            </div>
          )}
        </VwCard>
      </VwCard>

      <AtpDetailDrawer atp={selAtp} open={!!selAtp} onClose={() => setSelAtp(null)} />
    </div>
  );
}
