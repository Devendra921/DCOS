/** Rules — the four DMN decision tables rendered read-only, with an evaluate panel that highlights the matched rule. */
import { useMemo, useState } from 'react';
import { InputNumber, Select } from 'antd';
import { FlaskConical, Table2 } from 'lucide-react';
import { Chip, Panel, Tabs, Toggle } from '../../../ops/ui/kit';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersPage } from '../components/WorkOrdersHeader';
import { DmnTable } from '../components/DmnTable';
import { DECISIONS, DECISION_IDS, DMN_XML, evaluateDecision } from '../lib/dmn';

export default function RulesPage() {
  const [decisionId, setDecisionId] = useState<string>(DECISION_IDS[0]);
  const decision = DECISIONS[decisionId];
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(DECISION_IDS.map((id) => [id, Object.fromEntries(DECISIONS[id].inputs.map((i) => [i.key, i.default]))])));
  const vars = values[decisionId];
  const result = useMemo(() => evaluateDecision(decisionId, vars), [decisionId, vars]);
  const callers = PROCESSES.filter((p) => p.nodes.some((n) => n.decisionId === decisionId));
  const set = (k: string, v: unknown) => setValues((all) => ({ ...all, [decisionId]: { ...all[decisionId], [k]: v } }));

  const matched = result ? decision.rules.find((r) => r.id === result.ruleId) : undefined;

  return (
    <WorkOrdersPage title="Rules" description="DMN 1.3 decision tables called from business-rule tasks. Change the inputs to see which rule fires.">
      <Tabs value={decisionId} onChange={setDecisionId} tabs={DECISION_IDS.map((id) => ({ id, label: DECISIONS[id].name }))} />
      <div className="grid g-2-1">
        <Panel title={decision.name} sub={decision.summary} icon={Table2}
          actions={<>
            <Chip tone="neutral">hit policy · {decision.hitPolicy}</Chip>
            {callers.map((p) => <Chip key={p.key} tone="info">{p.pid} {p.name}</Chip>)}
          </>}
          foot={<span className="mono">src/workorders/dmn/{decisionId}.dmn · {decision.inputs.length} inputs · {decision.outputs.length} outputs · {decision.rules.length} rules</span>}>
          <DmnTable xml={DMN_XML[decisionId]} height={Math.max(260, 120 + decision.rules.length * 42)} highlightRuleIds={result ? [result.ruleId] : []} />
        </Panel>

        <Panel title="Evaluate" sub="Inputs to the decision" icon={FlaskConical}>
          <div className="col" style={{ gap: 14 }}>
            {decision.inputs.map((inp) => (
              <div key={inp.key} className="col" style={{ gap: 4 }}>
                <label className="nst-input-label" htmlFor={`in-${inp.key}`}>{inp.label} <span className="vw-label mono">{inp.key}</span></label>
                {inp.type === 'number' && <InputNumber id={`in-${inp.key}`} style={{ width: '100%' }} value={vars[inp.key] as number} onChange={(v) => set(inp.key, v ?? 0)} min={0} />}
                {inp.type === 'boolean' && <Toggle on={vars[inp.key] === true} onChange={(v) => set(inp.key, v)} label={inp.label} />}
                {inp.type === 'string' && <Select id={`in-${inp.key}`} value={vars[inp.key] as string} onChange={(v) => set(inp.key, v)} options={(inp.options ?? []).map((o) => ({ value: o, label: o }))} />}
              </div>
            ))}
            <div className="col" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
              <div className="row between">
                <span className="ops-label" style={{ margin: 0 }}>Result</span>
                <Chip tone={result ? 'success' : 'warning'} dot>{result ? `Matched ${result.ruleId}` : 'No match'}</Chip>
              </div>
              {result ? (
                <>
                  {matched?.description && <span className="vw-label">{matched.description}</span>}
                  <dl className="wf-kv">
                    {decision.outputs.map((o) => <OutputRow key={o.key} label={o.label} value={result.output[o.key]} />)}
                  </dl>
                </>
              ) : <span className="vw-label">No rule matched these inputs.</span>}
            </div>
          </div>
        </Panel>
      </div>
    </WorkOrdersPage>
  );
}

function OutputRow({ label, value }: { label: string; value: unknown }) {
  const tone = value === 'High' || value === 'SEV1' || value === 'P1' ? 'error' : value === 'Medium' || value === 'SEV2' || value === 'P2' ? 'warning' : value === 'Low' || value === true ? 'success' : 'neutral';
  return <><dt>{label}</dt><dd><Chip tone={tone}>{String(value)}</Chip></dd></>;
}
