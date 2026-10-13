/* Shared pieces of the in-site panels: check results, the site power chain, the site-fit banner. */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { VwCard, VwChip } from '../../../../../shared/components/ux';
import type * as T from '../../../../../mock/data/types';
import type { InSiteAnalysis } from '../../../lib/inSiteAnalysis';
import type { SiteBaseline } from '../../../lib/site';
import { FINDING_TONE } from '../../kit';
import { CHECK_LABEL, kwFmt, linkedPlanUrl, muted, num } from './helpers';

const STATUS = { pass: 'Pass', fail: 'Fail', warn: 'Warn', 'n/a': 'Not checked' } as const;

/** The in-site checks for this step, read from the plan's analysis. */
export function ChecksBlock({ a, keys }: { a?: InSiteAnalysis; keys: string[] }) {
  const rows = keys.map(k => [k, a?.checks[k]] as const).filter(([, c]) => !!c);
  if (!rows.length) return null;
  return (
    <div className="vw-flex vw-flex-col" style={{ marginTop: 8 }}>
      {rows.map(([k, c]) => (
        <div key={k} className="vw-flex vw-items-center vw-gap-sm" style={{ padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 13 }}>
          <VwChip variant={FINDING_TONE[c!.status]} style={{ minWidth: 80, justifyContent: 'center' }}>{STATUS[c!.status]}</VwChip>
          <span style={{ minWidth: 130, fontWeight: 500 }}>{CHECK_LABEL[k] ?? k}</span>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--vw-color-slate-600)' }}>{c!.detail}</span>
        </div>
      ))}
    </div>
  );
}

/** The site's power chain as the planner reads it: each stage's usable capacity at its redundancy and the IT headroom it leaves. */
export function SiteChain({ site, addKw }: { site?: SiteBaseline; addKw: number }) {
  if (!site) return <div style={muted}>Pick the site to read its power chain.</div>;
  const stages = site.stages.filter(s => s.key !== 'cooling');
  return (
    <div>
      <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
        <thead><tr><th>Stage</th><th>Redundancy</th><th style={num}>Usable</th><th style={num}>Load</th><th style={num}>IT headroom</th><th style={num}>After this plan</th><th>Basis</th></tr></thead>
        <tbody>{stages.map(s => { const after = Math.round((s.headroomItKw - addKw) * 10) / 10; const bind = site.binding?.key === s.key; return (
          <tr key={s.key} className={bind ? 'is-selected' : undefined}>
            <td style={{ fontWeight: 500 }}>{s.label}{bind && <VwChip variant="warning" style={{ marginLeft: 6, fontSize: 10 }}>binding</VwChip>}</td><td>{s.redundancy}</td>
            <td style={num}>{kwFmt(s.usableKw)}{s.facility ? ' (facility)' : ''}</td><td style={num}>{kwFmt(s.loadKw)}</td>
            <td style={num}>{kwFmt(Math.max(0, s.headroomItKw))}</td><td style={{ ...num, color: after < 0 ? 'var(--vw-color-red-600)' : undefined }}>{after < 0 ? `${kwFmt(-after)} short` : kwFmt(after)}</td>
            <td style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{s.basis}</td>
          </tr>); })}</tbody>
      </table></div>
      <div style={{ ...muted, marginTop: 4 }}>IT load today {kwFmt(site.itLoadKw)} · held by reservations {kwFmt(site.reservedKw)} · approved plans not yet holding capacity {kwFmt(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(p => p.plnId).join(', ')})` : ''} · PUE {site.pue} ({site.pueSource}){site.dcPlant ? ' · −48 V DC power plant' : ''}</div>
    </div>
  );
}

/** When the site cannot take the plan: by how much, and a pre-filled linked plant (or expansion) plan. */
export function ShortfallBanner({ a, plan }: { a?: InSiteAnalysis; plan: T.PlannerPlan }) {
  const nav = useNavigate();
  const s = a?.shortfall; if (!s) return null;
  return (
    <VwCard variant="child-shaded" tone="error" title={<span className="vw-flex vw-items-center vw-gap-xs"><VwChip variant="error">Does not fit</VwChip> Short of {s.what} by {kwFmt(s.kw)}</span>}
      extra={<button type="button" className="nst-btn nst-btn--sm nst-btn--filled" onClick={() => nav(linkedPlanUrl(s, plan))}>Create a linked {s.expansion ? 'expansion' : 'plant'} plan</button>}>
      <div style={muted}>{s.plantIntent}. The new plan opens in the wizard with this shortfall as its intent; approve it before this one.</div>
    </VwCard>
  );
}

export function Note({ children }: { children: ReactNode }) { return <div style={{ ...muted, marginTop: 6 }}>{children}</div>; }
