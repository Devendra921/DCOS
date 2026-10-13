import { useMemo, useState } from 'react';
import { FileJson, MousePointerClick } from 'lucide-react';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DataContract } from '../../futurestate/components/PreviewScaffold';
import type { PolicyDecision } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import type { Tone } from '../../../ops/ui/Analytics';

const DEC_TONE: Record<string, Tone> = { allow: 'success', deny: 'error', warn: 'orange' };
const DECISIONS = ['allow', 'deny', 'warn'] as const;
const label = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

export default function DecisionRecordsPage() {
  const all = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const [filter, setFilter] = useState<string>('');
  const [q, setQ] = useState('');
  const [byF, setByF] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = useMemo(() => [...all].sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1)), [all]);
  const evaluators = useMemo(() => [...new Set(all.map((d) => d.evaluatedBy))], [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sorted.filter((d) => (!filter || d.decision === filter) && (!byF || d.evaluatedBy === byF)
      && (!s || `${d.policyName} ${d.resourceName} ${d.resourceType}`.toLowerCase().includes(s)));
  }, [sorted, filter, byF, q]);
  const selected = all.find((d) => d.id === selectedId) ?? null;

  const cols: Col<PolicyDecision>[] = [
    { key: 'evaluated', header: 'Evaluated', sort: (r) => r.evaluatedAt, render: (r) => <span className="num">{r.evaluatedAt.slice(0, 16).replace('T', ' ')}</span> },
    { key: 'policy', header: 'Policy', sort: (r) => r.policyName, render: (r) => <span className="vw-card-activity-label">{r.policyName}</span> },
    { key: 'resource', header: 'Resource', sort: (r) => r.resourceName, render: (r) => (
      <span className="cell-2"><span>{r.resourceName}</span><small>{r.resourceType}</small></span>
    ) },
    { key: 'decision', header: 'Decision', sort: (r) => r.decision, render: (r) => <Chip tone={DEC_TONE[r.decision] ?? 'neutral'} dot>{r.decision.toUpperCase()}</Chip> },
    { key: 'by', header: 'By', sort: (r) => r.evaluatedBy, render: (r) => <Chip tone="purple">{r.evaluatedBy}</Chip> },
  ];

  return (
    <OpsPage title="Decision Records" description="Immutable log of every policy evaluation — the input sent to OPA, the policy applied, and the allow/deny/warn result.">
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'evaluated', dir: 'desc' }} pageSize={25}
          onRow={(r) => setSelectedId(selectedId === r.id ? null : r.id)} rowClass={(r) => (r.id === selectedId ? 'is-selected' : '')}
          toolbar={
            <ListToolbar shown={rows.length} total={all.length} noun="decisions"
              search={{ value: q, onChange: setQ, placeholder: 'Policy, resource' }}
              filters={[
                { id: 'decision', label: 'Decision', quick: true, value: filter, anyLabel: 'Any decision', onChange: setFilter, options: DECISIONS.map((d) => ({ id: d, label: label(d), count: all.filter((x) => x.decision === d).length })) },
                { id: 'by', label: 'Evaluated by', quick: true, value: byF, anyLabel: 'Any evaluator', onChange: setByF, options: evaluators.map((e) => ({ id: e, label: e, count: all.filter((x) => x.evaluatedBy === e).length })) },
              ]} />
          } />
      </section>

      <Panel title="OPA input" sub={selected ? `${selected.policyName} · ${selected.resourceName}` : 'Select a decision to see the document sent to OPA'} icon={FileJson}
        actions={selected ? <Chip tone={DEC_TONE[selected.decision] ?? 'neutral'} dot>{selected.decision.toUpperCase()}</Chip> : undefined}>
        {selected ? (
          <div className="col">
            <pre style={{ fontFamily: 'inherit', background: 'var(--vw-color-slate-900)', color: 'var(--vw-color-slate-200)', padding: 'var(--vw-space-md)', borderRadius: 6, fontSize: 'var(--vw-font-label-sm)', margin: 0, overflow: 'auto' }}>{JSON.stringify(JSON.parse(selected.input), null, 2)}</pre>
            <span className="muted">{selected.message}</span>
          </div>
        ) : <Empty icon={MousePointerClick} title="No decision selected">Click a row in the log to inspect its OPA input and result message.</Empty>}
      </Panel>

      <DataContract
        sources={['OPA policy engine (decision logs)']}
        cadence="Per evaluation (change-time + scheduled re-scan)"
        fields={[
          { name: 'input', desc: 'the JSON document sent to OPA (the resource being evaluated)' },
          { name: 'result.decision', desc: 'allow / deny / warn from the policy' },
          { name: 'result.violation[]', desc: 'human-readable violation messages from the policy' },
          { name: 'policyId / package', desc: 'which policy + package produced the decision' },
          { name: 'evaluatedAt / decisionId', desc: 'OPA decision-log id + timestamp for the audit trail' },
        ]}
        notes={[
          'Wire OPA decision logging (decision_logs) to stream every evaluation here; records must be immutable + attributable.',
          'The rows below are simulated against real seed entities to show the shape; live decisions come from your OPA service.',
        ]}
      />
    </OpsPage>
  );
}
