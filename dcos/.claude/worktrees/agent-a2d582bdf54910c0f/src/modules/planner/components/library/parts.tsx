/* Small presentational pieces shared by the Templates and Benchmarks tabs. */
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { VwChip } from '../../../../shared/components/ux';
import { fmtMonthYear, shortSource } from './labels';

/** Source of a value: short name, month, and whether it is confirmed by actuals. */
export function SourceCell({ source, date, indicative }: { source: string; date?: string; indicative?: boolean }) {
  return (
    <Tooltip title={`${source}${date ? ` · ${fmtMonthYear(date)}` : ''}`}>
      <span className="vw-flex vw-items-center vw-gap-xs" style={{ minWidth: 0 }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortSource(source)}</span>
        {indicative !== undefined && <VwChip variant={indicative ? 'neutral' : 'success'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', flexShrink: 0 }}>{indicative ? 'Indicative' : 'Confirmed'}</VwChip>}
      </span>
    </Tooltip>
  );
}

/** Section heading with a one-line explanation, used at the top of each library view. */
export function SectionIntro({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="vw-flex vw-justify-between vw-items-center vw-gap-md vw-wrap">
      <div style={{ minWidth: 0 }}>
        <div className="vw-card-title">{title}</div>
        <div className="vw-card-description" style={{ marginTop: 2 }}>{children}</div>
      </div>
      {extra}
    </div>
  );
}

/** "Must" or "Should" for a rule. */
export function RuleKind({ severity }: { severity: 'hard' | 'soft' }) {
  return <VwChip variant={severity === 'hard' ? 'error' : 'warning'}>{severity === 'hard' ? 'Must' : 'Should'}</VwChip>;
}
