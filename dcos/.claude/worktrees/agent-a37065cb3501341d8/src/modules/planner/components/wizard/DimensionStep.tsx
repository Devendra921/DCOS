/* A dimension step: the template's inputs for this dimension (each input appears only here),
   pre-filled from the requirements with the reason shown, then what the planner works out,
   the rules checked for this dimension and any AI proposal that applies to these inputs. */
import { useMemo, useState } from 'react';
import { VwChip } from '../../../../shared/components/ux';
import { sizingProposals } from '../../lib/ai';
import { requirementParamKeys, type Dimension } from '../../lib/dimensions';
import { FINDING_TONE, ProposalCard } from '../kit';
import { fmtParam, paramDefsFor, type StepProps } from './wizardModel';
import { ParamField, StepTitle, SubTitle } from './ParamField';
import { DIMENSION_PANEL } from './DimensionPanels';
import { uiFor } from '../scopes/registry';

const STATUS_LABEL = { pass: 'Pass', fail: 'Fail', warn: 'Warn', 'n/a': 'N/A' } as const;
const proposalKey = (title: string, value: number | string) => (typeof value === 'string' ? 'coolingType' : /PUE/i.test(title) ? 'pueTarget' : /carrier/i.test(title) ? 'carrierCount' : 'densityKwPerRack');

export function DimensionStep(props: StepProps & { dim: Dimension; depth: 'full' | 'summary' }) {
  const { dim, depth, draft, ev, templates, benchmarks, actuals, setParam, resetParam, actions, why, goTo } = props;
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [showAll, setShowAll] = useState(false);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const reqKeys = requirementParamKeys(draft.scope);
  const inputs = useMemo(() => [...defs.values()].filter(d => dim.aspects.includes(d.aspect) && !reqKeys.includes(d.key)), [defs, dim, reqKeys]);
  const fixed = useMemo(() => [...defs.values()].filter(d => dim.aspects.includes(d.aspect) && reqKeys.includes(d.key)), [defs, dim, reqKeys]);
  const findings = (ev?.findings ?? []).filter(f => dim.aspects.includes(f.rule.aspect) && f.status !== 'n/a');
  const fromReq = inputs.filter(d => ev?.params[d.key]?.source === 'requirement').length;
  const proposals = useMemo(() => (ev ? sizingProposals(draft, ev, actuals, benchmarks).filter(p => inputs.some(i => i.key === proposalKey(p.title, p.value as number | string))) : []), [draft, ev, actuals, benchmarks, inputs]);
  const Panel = uiFor(draft.scope).panels?.[dim.key] ?? DIMENSION_PANEL[dim.key];
  const visible = depth === 'summary' && !showAll ? inputs.slice(0, 3) : inputs;

  return (
    <div>
      <StepTitle title={dim.label} description={dim.question} extra={<span className="vw-flex vw-gap-xs">{depth === 'summary' && <VwChip variant="neutral">Brief for this plan type</VwChip>}{findings.some(f => f.status === 'fail') ? <VwChip variant="error">{findings.filter(f => f.status === 'fail').length} must fix</VwChip> : findings.length ? <VwChip variant="success">Checks pass</VwChip> : null}</span>} />

      {fixed.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', marginBottom: 8 }}>
          From Requirements: {fixed.map(d => <b key={d.key} style={{ marginRight: 8 }}>{d.label} {fmtParam(d.key, ev?.params[d.key]?.value ?? d.default, d.unit)}</b>)}
          <a onClick={() => goTo('requirements')}>change</a>
        </div>
      )}

      {inputs.length > 0 && (<>
        <SubTitle extra={fromReq > 0 && <span style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{fromReq} filled from your requirements — change only what differs</span>}>Inputs</SubTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {visible.map(d => (
            <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <ParamField def={d} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} />
              {ev?.params[d.key]?.source === 'requirement' && why[d.key] && <span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)', padding: '0 4px' }}>{why[d.key]}</span>}
            </div>
          ))}
        </div>
        {visible.length < inputs.length && <a style={{ display: 'inline-block', marginTop: 6, fontSize: 12 }} onClick={() => setShowAll(true)}>Show {inputs.length - visible.length} more input{inputs.length - visible.length === 1 ? '' : 's'} (brief for this plan type)</a>}
      </>)}

      {proposals.filter(p => decided[p.title] !== 'rejected').length > 0 && (<>
        <SubTitle>Suggestions</SubTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {proposals.filter(p => decided[p.title] !== 'rejected').map(p => {
            const key = proposalKey(p.title, p.value as number | string);
            return <ProposalCard key={p.title} p={p} applied={decided[p.title] === 'accepted'} onAccept={() => { setParam(key, p.value as number | string, 'ai'); actions.recordFeedback('sizing-assistant', draft.id, true, p.title); setDecided(x => ({ ...x, [p.title]: 'accepted' })); }} onReject={() => { actions.recordFeedback('sizing-assistant', draft.id, false, p.title); setDecided(x => ({ ...x, [p.title]: 'rejected' })); }} />;
          })}
        </div>
      </>)}

      <SubTitle>Result</SubTitle>
      <Panel {...props} />

      {findings.length > 0 && (<>
        <SubTitle>Checks for {dim.label.toLowerCase()}</SubTitle>
        <div className="vw-flex vw-flex-col">
          {[...findings].sort((a, b) => (a.status === 'fail' ? -1 : b.status === 'fail' ? 1 : a.status === 'warn' ? -1 : 1)).map(f => (
            <div key={f.rule.id} className="vw-flex vw-items-center vw-gap-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 13 }}>
              <VwChip variant={FINDING_TONE[f.status]} style={{ minWidth: 44, justifyContent: 'center' }}>{STATUS_LABEL[f.status]}</VwChip>
              <span style={{ flex: 1, minWidth: 0 }}>{f.rule.title}<span style={{ color: 'var(--vw-color-slate-500)' }}> · {f.detail}</span></span>
              <VwChip variant={f.rule.severity === 'hard' ? 'error' : 'warning'} style={{ fontSize: 10 }}>{f.rule.severity === 'hard' ? 'Must' : 'Should'}</VwChip>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
