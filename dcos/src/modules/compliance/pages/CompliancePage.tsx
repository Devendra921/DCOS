import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ComplianceControl, ComplianceFramework, PolicyDecision, Policy } from '../../../mock/data/types';
import { deriveControlStatus } from '../lib/controlScore';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel, PanelLink } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';

const CONTROL_STATUS_TONE: Record<string, Tone> = { Compliant: 'success', InProgress: 'warning', NonCompliant: 'error', NotAssessed: 'neutral' };

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
  type Row = (typeof m.attention)[number];

  const [q, setQ] = useState('');
  const [stdF, setStdF] = useState('');
  const [statusF, setStatusF] = useState('');
  const standards = useMemo(() => [...new Set(m.attention.map((c) => c.standard))], [m.attention]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return m.attention.filter((c) => (!stdF || c.standard === stdF) && (!statusF || c.dstatus === statusF)
      && (!s || `${c.standard} ${c.ref} ${c.title} ${c.type}`.toLowerCase().includes(s)));
  }, [m.attention, q, stdF, statusF]);

  const cols: Col<Row>[] = [
    { key: 'control', header: 'Control', sort: (r) => r.title, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.title}</span><small className="mono">{r.ref}</small></span>
    ) },
    { key: 'standard', header: 'Standard', sort: (r) => r.standard, render: (r) => <Chip>{r.standard}</Chip> },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip tone={r.type === 'Automated' ? 'info' : 'neutral'}>{r.type}</Chip> },
    { key: 'status', header: 'Status', sort: (r) => r.dstatus, render: (r) => <Chip tone={CONTROL_STATUS_TONE[r.dstatus] ?? 'neutral'} dot>{r.dstatus}</Chip> },
  ];

  const fwItems = frameworks.map((f) => {
    const pct = m.posture(f.name);
    return { key: f.id, label: f.name, sublabel: f.version, value: pct, display: `${pct}%`, color: pct < 60 ? 'var(--vw-color-red-400)' : undefined };
  });

  return (
    <OpsPage title="Posture" description="Control posture derived from OPA decisions and manual attestations.">
      <StatGrid cols={4}>
        <StatTile label="Overall posture" value={<>{m.overall}<small>%</small></>} sub="controls compliant" subTone={m.overall < 60 ? 'bad' : undefined}>
          <SoftMeter pct={m.overall} tone={m.overall < 60 ? 'error' : 'success'} />
        </StatTile>
        <StatTile label="Controls compliant" value={m.compliant} sub={`of ${controls.length} controls`} />
        <StatTile label="Non-compliant" value={m.nonCompliant} sub={m.nonCompliant ? 'controls failing' : 'none failing'} subTone={m.nonCompliant ? 'bad' : undefined} />
        <StatTile label="Open policy violations" value={m.violations} sub={m.violations ? 'deny or warn decisions' : 'no open violations'} subTone={m.violations ? 'warn' : undefined} />
      </StatGrid>

      <Panel title="Framework posture" sub="Share of each framework's controls that are compliant" icon={ShieldCheck} count={frameworks.length}>
        <BarList items={fwItems} max={100} />
      </Panel>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'status', dir: 'asc' }} pageSize={25}
          empty={<Empty icon={ShieldCheck} title="All controls compliant" />}
          toolbar={
            <ListToolbar shown={rows.length} total={m.attention.length} noun="controls needing attention"
              search={{ value: q, onChange: setQ, placeholder: 'Control, reference, standard' }}
              filters={[
                { id: 'standard', label: 'Standard', quick: true, value: stdF, anyLabel: 'Any standard', onChange: setStdF, options: standards.map((s) => ({ id: s, label: s, count: m.attention.filter((c) => c.standard === s).length })) },
                { id: 'status', label: 'Status', quick: true, value: statusF, anyLabel: 'Any status', onChange: setStatusF, options: ['NonCompliant', 'NotAssessed'].map((s) => ({ id: s, label: s, count: m.attention.filter((c) => c.dstatus === s).length })) },
              ]}>
              <PanelLink onClick={() => navigate('/compliance/controls')}>All controls</PanelLink>
            </ListToolbar>
          } />
      </section>
    </OpsPage>
  );
}
