/* Copilot tab: a grounded question-and-answer panel on this plan. Answers cite evidence; thumbs record feedback. */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Input } from 'antd';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { SendOutlined, CheckOutlined, CloseOutlined, ThunderboltOutlined } from '../../../../shared/icons';
import { answerQuestion, COPILOT_SUGGESTIONS, type Answer } from '../../lib/ai';
import { EvidenceLinks } from '../kit';
import { Muted, type PlanView } from './shared';

interface Turn { id: number; question: string; answer: Answer; feedback?: boolean }

export function CopilotTab({ v }: { v: PlanView }) {
  const { plan, ev, scenarios, actuals, actions } = v;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const answer = answerQuestion(text, plan, ev, scenarios, actuals);
    setTurns(t => [...t, { id: ++seq.current, question: text, answer }]);
    setDraft('');
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 30);
  };
  const rate = (id: number, accepted: boolean) => {
    const t = turns.find(x => x.id === id);
    if (!t || t.feedback !== undefined) return;
    actions.recordFeedback('copilot', plan.id, accepted, t.question);
    setTurns(ts => ts.map(x => (x.id === id ? { ...x, feedback: accepted } : x)));
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } };
  const lastFollowups = turns.length ? turns[turns.length - 1].answer.followups : [];

  return (
    <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 300px)' }}>
      <VwCard title={<span className="vw-inline-flex vw-items-center vw-gap-xs"><ThunderboltOutlined /> Plan copilot</span>} extra={<Muted>grounded on {v.viewScenario ? `scenario ${v.viewScenario.name}` : 'the base case'}, {scenarios.length} scenario(s), {actuals.sampleSites} live site(s)</Muted>}>
        <div className="vw-flex vw-flex-col vw-gap-md" style={{ minHeight: 360, maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
          {turns.length === 0 && (
            <div className="vw-card-child" style={{ padding: 14 }}>
              <div style={{ fontSize: 'var(--vw-font-label-md)', fontWeight: 500 }}>Ask about this plan</div>
              <Muted>Answers come from the engine's evaluation, the scenarios and the estate actuals — never from outside this plan. Start with a suggestion on the right or type a question.</Muted>
            </div>
          )}
          {turns.map(t => (
            <div key={t.id} className="vw-flex vw-flex-col vw-gap-xs">
              <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'var(--vw-color-blue-50)', border: '1px solid var(--vw-color-blue-100)', borderRadius: 'var(--vw-radius-md)', padding: '8px 12px', fontSize: 'var(--vw-font-label-sm)' }}>{t.question}</div>
              <div className="vw-card-child" style={{ padding: 12, alignSelf: 'flex-start', maxWidth: '92%' }}>
                <div className="vw-flex vw-items-center vw-gap-xs vw-wrap" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--vw-font-label-md)', fontWeight: 600 }}>{t.answer.title}</span>
                  <VwChip variant="purple">{t.answer.confidence}% confidence</VwChip>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--vw-font-label-sm)', lineHeight: 1.5 }}>{t.answer.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm vw-wrap" style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--vw-color-slate-100)' }}>
                  <EvidenceLinks items={t.answer.evidence} />
                  <span className="vw-inline-flex vw-items-center vw-gap-xs">
                    {t.feedback === undefined ? <>
                      <Button size="small" type="text" icon={<CheckOutlined />} onClick={() => rate(t.id, true)}>Helpful</Button>
                      <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => rate(t.id, false)}>Not helpful</Button>
                    </> : <Muted size="xs">{t.feedback ? 'Marked helpful' : 'Marked not helpful'} · recorded</Muted>}
                  </span>
                </div>
                {t.answer.followups.length > 0 && <div className="vw-flex vw-wrap vw-gap-xs" style={{ marginTop: 6 }}>{t.answer.followups.map(f => <VwChip key={f} variant="neutral" onClick={() => ask(f)} style={{ cursor: 'pointer' }}>{f}</VwChip>)}</div>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="vw-flex vw-gap-sm vw-items-end" style={{ marginTop: 12 }}>
          <Input.TextArea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Ask about cost, capacity, schedule, rules, risks or scenarios…" />
          <Button type="primary" icon={<SendOutlined />} onClick={() => ask(draft)} disabled={!draft.trim()}>Ask</Button>
        </div>
      </VwCard>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <VwCard title="Suggestions">
          <div className="vw-flex vw-flex-col vw-gap-xs">
            {(lastFollowups.length ? [...lastFollowups, ...COPILOT_SUGGESTIONS.filter(s => !lastFollowups.includes(s))] : COPILOT_SUGGESTIONS).map(s => (
              <button key={s} type="button" className="nst-btn nst-btn--sm" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        </VwCard>
        <VwCard title="This conversation">
          <Muted>{turns.length} question(s) · {turns.filter(t => t.feedback !== undefined).length} rated. The conversation lives on this page only; feedback is recorded against the plan.</Muted>
          {turns.length > 0 && <div style={{ marginTop: 8 }}><Button size="small" onClick={() => setTurns([])}>Clear</Button></div>}
        </VwCard>
      </div>
    </div>
  );
}
