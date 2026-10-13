/* Rules tab: every finding grouped by aspect, with its standard and severity, filterable by status. */
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Chip, Panel, Seg } from '../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { ASPECT_LABEL, type Finding } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { FINDING_TONE } from '../kit';
import { Muted, ToneValue, type PlanView } from './shared';

type Filter = 'all' | 'pass' | 'warn' | 'fail';
const STATUS_LABEL: Record<Finding['status'], string> = { pass: 'Pass', fail: 'Fail', warn: 'Warn', 'n/a': 'Not applicable' };

export function RulesTab({ v }: { v: PlanView }) {
  const { ev } = v;
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => ({ pass: ev.findings.filter(f => f.status === 'pass').length, warn: ev.findings.filter(f => f.status === 'warn').length, fail: ev.findings.filter(f => f.status === 'fail').length, na: ev.findings.filter(f => f.status === 'n/a').length }), [ev.findings]);
  const groups = useMemo(() => {
    const by = new Map<T.PlannerAspect, Finding[]>();
    for (const f of ev.findings) { if (filter !== 'all' && f.status !== filter) continue; const l = by.get(f.rule.aspect) ?? []; l.push(f); by.set(f.rule.aspect, l); }
    const order: Record<Finding['status'], number> = { fail: 0, warn: 1, pass: 2, 'n/a': 3 };
    return [...by.entries()].map(([aspect, items]) => ({ aspect, items: items.sort((a, b) => order[a.status] - order[b.status]) })).sort((a, b) => Math.min(...a.items.map(i => order[i.status])) - Math.min(...b.items.map(i => order[i.status])));
  }, [ev.findings, filter]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid cols={4}>
        <StatTile label="Rules evaluated" value={ev.findings.length} sub={`${ev.resolved?.chain.length ?? 0} template(s) in the chain`} />
        <StatTile label="Hard fails" value={<ToneValue tone={counts.fail ? 'bad' : 'ok'}>{counts.fail}</ToneValue>} sub="block submission" />
        <StatTile label="Warnings" value={<ToneValue tone={counts.warn ? 'warn' : 'ok'}>{counts.warn}</ToneValue>} sub="soft rules" />
        <StatTile label="Pass" value={<ToneValue tone={"ok"}>{counts.pass}</ToneValue>} sub={`${counts.na} not applicable`} />
      </StatGrid>
      <Panel icon={ShieldCheck} title="Findings by aspect" actions={<Seg<Filter> size="sm" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'pass', label: `Pass ${counts.pass}` }, { id: 'warn', label: `Warn ${counts.warn}` }, { id: 'fail', label: `Fail ${counts.fail}` }]} />}>
        {groups.length === 0 && <Muted>No findings match this filter.</Muted>}
        <div className="col" style={{ gap: 16 }}>
          {groups.map(g => (
            <div key={g.aspect}>
              <div className="vw-flex vw-items-center vw-gap-sm" style={{ marginBottom: 6 }}>
                <b className="strong">{ASPECT_LABEL[g.aspect]}</b>
                <Muted size="xs">{g.items.length} rule(s)</Muted>
              </div>
              <div className="vw-flex vw-flex-col vw-gap-xs">
                {g.items.map(f => (
                  <div key={f.rule.id} className="row" style={{ gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--vw-color-slate-200)', borderRadius: 10 }}>
                    <Chip tone={FINDING_TONE[f.status]} dot>{STATUS_LABEL[f.status]}</Chip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="vw-flex vw-items-center vw-gap-xs vw-wrap">
                        <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{f.rule.title}</span>
                        <Muted size="xs">{f.rule.id}</Muted>
                        <Chip tone={f.rule.severity === 'hard' ? 'error' : 'neutral'}>{f.rule.severity}</Chip>
                        {f.value && <Chip tone="neutral">{f.value}</Chip>}
                        {/^Declared|Declared:/.test(f.detail) && <Chip tone="warning" outline>declared, not measured</Chip>}
                        {f.status === 'n/a' && /^Not checked/.test(f.detail) && <Chip tone="neutral">not checked</Chip>}
                      </div>
                      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>{f.detail}</div>
                      {(f.rule.standard || f.rule.source) && <Muted size="xs">{f.rule.standard ?? f.rule.source}{f.rule.threshold !== undefined ? ` · threshold ${f.rule.threshold}` : ''}</Muted>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
