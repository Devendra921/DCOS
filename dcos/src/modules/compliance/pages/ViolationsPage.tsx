import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { PolicyDecision } from '../../../mock/data/types';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Split, StatGrid, StatTile } from '../../../ops/ui/Analytics';

export default function ViolationsPage() {
  const decisions = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const violations = useMemo(
    () => decisions.filter((d) => d.violated).sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1)),
    [decisions],
  );
  const denies = violations.filter((v) => v.decision === 'deny').length;
  const warns = violations.filter((v) => v.decision === 'warn').length;

  const [q, setQ] = useState('');
  const [outcomeF, setOutcomeF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [enfF, setEnfF] = useState('');
  const resourceTypes = useMemo(() => [...new Set(violations.map((v) => v.resourceType))], [violations]);
  const enforcements = useMemo(() => [...new Set(violations.map((v) => v.enforcement).filter(Boolean))], [violations]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return violations.filter((v) => (!outcomeF || v.decision === outcomeF) && (!typeF || v.resourceType === typeF) && (!enfF || v.enforcement === enfF)
      && (!s || `${v.policyName} ${v.resourceName} ${v.resourceType} ${v.message}`.toLowerCase().includes(s)));
  }, [violations, q, outcomeF, typeF, enfF]);

  const cols: Col<PolicyDecision>[] = [
    { key: 'raised', header: 'Raised', sort: (r) => r.evaluatedAt, render: (r) => <span className="num">{r.evaluatedAt.slice(0, 10)}</span> },
    { key: 'policy', header: 'Policy', sort: (r) => r.policyName, render: (r) => <span className="vw-card-activity-label">{r.policyName}</span> },
    { key: 'resource', header: 'Resource', sort: (r) => r.resourceName, render: (r) => (
      <span className="cell-2"><span>{r.resourceName}</span><small>{r.resourceType}</small></span>
    ) },
    { key: 'outcome', header: 'Outcome', sort: (r) => r.decision, render: (r) => <Chip tone={r.decision === 'deny' ? 'error' : 'orange'} dot>{r.decision === 'deny' ? 'Blocked' : 'Warned'} · {r.enforcement}</Chip> },
    { key: 'message', header: 'Message', wrap: true, render: (r) => r.message },
    { key: 'change', header: 'Change', render: (r) => r.changeRequestId ? <Link className="ent-link" to={`/change/${r.changeRequestId}`} onClick={(e) => e.stopPropagation()}>view →</Link> : <span className="vw-label">—</span> },
  ];

  const outcomeParts = [
    { key: 'deny', label: 'Blocked', n: denies, tone: 'error' as const },
    { key: 'warn', label: 'Warned', n: warns, tone: 'orange' as const },
  ];

  return (
    <OpsPage title="Policy Violations" description="Open deny and warn decisions raised by OPA policies.">
      <StatGrid cols={3}>
        <StatTile label="Open violations" value={violations.length} sub={`${resourceTypes.length} resource types`} subTone={violations.length ? 'warn' : undefined}>
          <Split parts={outcomeParts} onPick={(k) => setOutcomeF(outcomeF === k ? '' : k)} active={outcomeF} />
        </StatTile>
        <StatTile label="Blocked (deny)" value={denies} sub="changes stopped by policy" subTone={denies ? 'bad' : undefined}
          onClick={() => setOutcomeF(outcomeF === 'deny' ? '' : 'deny')} active={outcomeF === 'deny'} />
        <StatTile label="Warned" value={warns} sub="allowed with a warning" subTone={warns ? 'warn' : undefined}
          onClick={() => setOutcomeF(outcomeF === 'warn' ? '' : 'warn')} active={outcomeF === 'warn'} />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'raised', dir: 'desc' }} pageSize={25}
          toolbar={
            <ListToolbar shown={rows.length} total={violations.length} noun="violations"
              search={{ value: q, onChange: setQ, placeholder: 'Policy, resource, message' }}
              filters={[
                { id: 'outcome', label: 'Outcome', quick: true, value: outcomeF, anyLabel: 'Any outcome', onChange: setOutcomeF, options: outcomeParts.map((p) => ({ id: p.key, label: p.label, count: p.n })) },
                { id: 'type', label: 'Resource type', quick: true, value: typeF, anyLabel: 'Any resource type', onChange: setTypeF, options: resourceTypes.map((t) => ({ id: t, label: t, count: violations.filter((v) => v.resourceType === t).length })) },
                { id: 'enforcement', label: 'Enforcement', value: enfF, anyLabel: 'Any enforcement', onChange: setEnfF, options: enforcements.map((e) => ({ id: e, label: e, count: violations.filter((v) => v.enforcement === e).length })) },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
