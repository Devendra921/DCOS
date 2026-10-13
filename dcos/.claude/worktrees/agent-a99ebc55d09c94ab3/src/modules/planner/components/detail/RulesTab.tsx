/* Rules tab: every finding grouped by aspect, with its standard and severity, filterable by status. */
import { useMemo, useState } from 'react';
import { VwCard, VwChip, VwSegmented } from '../../../../shared/components/ux';
import { ASPECT_LABEL, type Finding } from '../../lib/engine';
import type * as T from '../../../../mock/data/types';
import { FINDING_TONE, Stat } from '../kit';
import { Muted, type PlanView } from './shared';

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
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Rules evaluated" value={ev.findings.length} sub={`${ev.resolved?.chain.length ?? 0} template(s) in the chain`} />
        <Stat label="Hard fails" value={counts.fail} sub="block submission" tone={counts.fail ? 'bad' : 'ok'} />
        <Stat label="Warnings" value={counts.warn} sub="soft rules" tone={counts.warn ? 'warn' : 'ok'} />
        <Stat label="Pass" value={counts.pass} sub={`${counts.na} not applicable`} tone="ok" />
      </div>
      <VwCard title="Findings by aspect" extra={<VwSegmented<Filter> size="small" value={filter} onChange={setFilter} options={[{ label: 'All', value: 'all' }, { label: `Pass ${counts.pass}`, value: 'pass' }, { label: `Warn ${counts.warn}`, value: 'warn' }, { label: `Fail ${counts.fail}`, value: 'fail' }]} />}>
        {groups.length === 0 && <div className="vw-card-description">No findings match this filter.</div>}
        <div className="vw-flex vw-flex-col vw-gap-md">
          {groups.map(g => (
            <div key={g.aspect}>
              <div className="vw-flex vw-items-center vw-gap-sm" style={{ marginBottom: 6 }}>
                <span className="vw-card-title-sm">{ASPECT_LABEL[g.aspect]}</span>
                <Muted size="xs">{g.items.length} rule(s)</Muted>
              </div>
              <div className="vw-flex vw-flex-col vw-gap-xs">
                {g.items.map(f => (
                  <div key={f.rule.id} className="vw-card-child vw-flex vw-gap-sm vw-items-start" style={{ padding: '8px 12px' }}>
                    <VwChip variant={FINDING_TONE[f.status]} style={{ minWidth: 48, justifyContent: 'center' }}>{STATUS_LABEL[f.status]}</VwChip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="vw-flex vw-items-center vw-gap-xs vw-wrap">
                        <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{f.rule.title}</span>
                        <Muted size="xs">{f.rule.id}</Muted>
                        <VwChip variant={f.rule.severity === 'hard' ? 'error' : 'neutral'}>{f.rule.severity}</VwChip>
                        {f.value && <VwChip variant="neutral">{f.value}</VwChip>}
                        {/^Declared|Declared:/.test(f.detail) && <VwChip variant="warning-outlined">declared, not measured</VwChip>}
                        {f.status === 'n/a' && /^Not checked/.test(f.detail) && <VwChip variant="neutral">not checked</VwChip>}
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
      </VwCard>
    </div>
  );
}
