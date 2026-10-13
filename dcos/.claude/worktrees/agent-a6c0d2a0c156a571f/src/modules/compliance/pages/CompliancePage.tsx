import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { SafetyCertificateOutlined, CheckCircleOutlined, WarningOutlined, StopOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import type { ComplianceControl, ComplianceFramework, PolicyDecision, Policy } from '../../../mock/data/types';
import { deriveControlStatus } from '../lib/controlScore';
import { VwCard, VwChip } from '../../../shared/components/ux';

const statusColor: Record<string, string> = { Compliant: 'green', InProgress: 'gold', NonCompliant: 'red', NotAssessed: 'default' };

export default function CompliancePage() {
  const navigate = useNavigate();
  const controls = (useEntityList('complianceControls', { pageSize: 200 }).data?.data ?? []) as unknown as ComplianceControl[];
  const decisions = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const policies = (useEntityList('policies', { pageSize: 100 }).data?.data ?? []) as unknown as Policy[];
  const frameworks = (useEntityList('complianceFrameworks', { pageSize: 100 }).data?.data ?? []) as unknown as ComplianceFramework[];

  const m = useMemo(() => {
    // Status is DERIVED: automated controls from their backing policy's OPA decisions; manual from attestation.
    const scored = controls.map((c) => ({ ...c, dstatus: deriveControlStatus(c, policies, decisions) }));
    const posture = (std: string) => {
      const inStd = scored.filter((c) => c.standard === std);
      const ok = inStd.filter((c) => c.dstatus === 'Compliant').length;
      return inStd.length ? Math.round((ok / inStd.length) * 100) : 0;
    };
    const overall = scored.length ? Math.round((scored.filter((c) => c.dstatus === 'Compliant').length / scored.length) * 100) : 0;
    return {
      posture, overall,
      compliant: scored.filter((c) => c.dstatus === 'Compliant').length,
      nonCompliant: scored.filter((c) => c.dstatus === 'NonCompliant').length,
      evidence: controls.reduce((s, c) => s + (c.evidenceCount ?? 0), 0),
      violations: decisions.filter((d) => d.violated).length,
      attention: scored.filter((c) => c.dstatus === 'NonCompliant' || c.dstatus === 'NotAssessed'),
    };
  }, [controls, decisions, policies]);

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Compliance Posture</div>

      <div className="vw-grid vw-grid-cols-auto-320 vw-gap-lg" style={{ margin: '16px 0' }}>
        {frameworks.map((f) => (
          <VwCard size="small" key={f.id}><div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 500 }}>{f.name} {f.version && <VwChip>{f.version}</VwChip>}</div>
            <Progress percent={m.posture(f.name)} size="small" status={m.posture(f.name) < 60 ? 'exception' : 'normal'} /></VwCard>
        ))}
      </div>

      <div className="vw-grid vw-grid-cols-4 vw-gap-md" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <KPICard title="Overall posture" value={m.overall} suffix="%" color={m.overall < 60 ? 'var(--vw-color-red-600)' : 'var(--vw-color-green-600)'} icon={<SafetyCertificateOutlined />} iconTone="info" />
        <KPICard title="Controls compliant" value={m.compliant} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Non-compliant" value={m.nonCompliant} color={m.nonCompliant ? 'var(--vw-color-red-600)' : undefined} icon={<StopOutlined />} iconTone="error" />
        <KPICard title="Open policy violations" value={m.violations} color={m.violations ? '#f59e0b' : undefined} icon={<WarningOutlined />} iconTone="warning" />
      </div>

      <VwCard size="small" title="Controls needing attention" extra={<a onClick={() => navigate('/compliance/controls')}>All controls →</a>}>
        <Table size="small" rowKey="id" dataSource={m.attention} pagination={false} locale={{ emptyText: 'All controls compliant.' }} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Standard', dataIndex: 'standard', render: (s: string) => <VwChip>{s}</VwChip> },
            { title: 'Ref', dataIndex: 'ref', render: (r: string) => <span>{r}</span> },
            { title: 'Control', dataIndex: 'title' },
            { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip color={t === 'Automated' ? 'blue' : 'default'}>{t}</VwChip> },
            { title: 'Status', dataIndex: 'dstatus', render: (s: string) => <VwChip color={statusColor[s]}>{s}</VwChip> },
          ]} />
      </VwCard>
    </div>
  );
}
