/** Rules — the four DMN decision tables rendered read-only, with an evaluate panel that highlights the matched rule. */
import { useMemo, useState } from 'react';
import { InputNumber, Select, Switch, Typography } from 'antd';
import { VwCard, VwChip, VwSegmented } from '../../../shared/components/ux';
import { PROCESSES } from '../../../workorders/model';
import { WorkOrdersHeader } from '../components/WorkOrdersHeader';
import { DmnTable } from '../components/DmnTable';
import { DECISIONS, DECISION_IDS, DMN_XML, evaluateDecision } from '../lib/dmn';
const { Text } = Typography;

export default function RulesPage() {
  const [decisionId, setDecisionId] = useState<string>(DECISION_IDS[0]);
  const decision = DECISIONS[decisionId];
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(DECISION_IDS.map((id) => [id, Object.fromEntries(DECISIONS[id].inputs.map((i) => [i.key, i.default]))])));
  const vars = values[decisionId];
  const result = useMemo(() => evaluateDecision(decisionId, vars), [decisionId, vars]);
  const callers = PROCESSES.filter((p) => p.nodes.some((n) => n.decisionId === decisionId));
  const set = (k: string, v: unknown) => setValues((all) => ({ ...all, [decisionId]: { ...all[decisionId], [k]: v } }));

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <WorkOrdersHeader title="Rules" description="DMN 1.3 decision tables called from business-rule tasks. Change the inputs to see which rule fires." />
      <VwSegmented value={decisionId} onChange={setDecisionId} options={DECISION_IDS.map((id) => ({ value: id, label: DECISIONS[id].name }))} />
      <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)' }}>
        <VwCard
          title={decision.name}
          extra={<div className="vw-flex vw-gap-xs vw-items-center vw-wrap">
            <VwChip variant="neutral">hit policy · {decision.hitPolicy}</VwChip>
            {callers.map((p) => <VwChip key={p.key} variant="info">{p.pid} {p.name}</VwChip>)}
          </div>}
        >
          <div className="vw-flex vw-flex-col vw-gap-sm">
            <div className="vw-card-description">{decision.summary}</div>
            <DmnTable xml={DMN_XML[decisionId]} height={Math.max(260, 120 + decision.rules.length * 42)} highlightRuleIds={result ? [result.ruleId] : []} />
            <Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>src/workorders/dmn/{decisionId}.dmn · {decision.inputs.length} inputs · {decision.outputs.length} outputs · {decision.rules.length} rules</Text>
          </div>
        </VwCard>

        <VwCard title="Evaluate">
          <div className="vw-flex vw-flex-col vw-gap-md">
            {decision.inputs.map((inp) => (
              <div key={inp.key} className="vw-flex vw-flex-col vw-gap-xs">
                <label className="nst-input-label" htmlFor={`in-${inp.key}`}>{inp.label} <Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{inp.key}</Text></label>
                {inp.type === 'number' && <InputNumber id={`in-${inp.key}`} style={{ width: '100%' }} value={vars[inp.key] as number} onChange={(v) => set(inp.key, v ?? 0)} min={0} />}
                {inp.type === 'boolean' && <Switch id={`in-${inp.key}`} checked={vars[inp.key] === true} onChange={(v) => set(inp.key, v)} />}
                {inp.type === 'string' && <Select id={`in-${inp.key}`} value={vars[inp.key] as string} onChange={(v) => set(inp.key, v)} options={(inp.options ?? []).map((o) => ({ value: o, label: o }))} />}
              </div>
            ))}
            <VwCard variant="child-shaded" title="Result" tone={result ? 'success' : 'warning'}>
              {result ? (
                <div className="vw-flex vw-flex-col vw-gap-xs">
                  <Text type="secondary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>Matched {result.ruleId}{decision.rules.find((r) => r.id === result.ruleId)?.description ? ` — ${decision.rules.find((r) => r.id === result.ruleId)!.description}` : ''}</Text>
                  <dl className="wf-kv">
                    {decision.outputs.map((o) => <OutputRow key={o.key} label={o.label} value={result.output[o.key]} />)}
                  </dl>
                </div>
              ) : <div className="vw-card-description">No rule matched these inputs.</div>}
            </VwCard>
          </div>
        </VwCard>
      </div>
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: unknown }) {
  const tone = value === 'High' || value === 'SEV1' || value === 'P1' ? 'error' : value === 'Medium' || value === 'SEV2' || value === 'P2' ? 'warning' : value === 'Low' || value === true ? 'success' : 'neutral';
  return <><dt>{label}</dt><dd><VwChip variant={tone}>{String(value)}</VwChip></dd></>;
}
