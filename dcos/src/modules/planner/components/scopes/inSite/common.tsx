/* Shared pieces of the in-site panels: check results, the site power chain, the site-fit banner. */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Btn, Chip } from '../../../../../ops/ui/kit';
import type * as T from '../../../../../mock/data/types';
import type { InSiteAnalysis } from '../../../lib/inSiteAnalysis';
import type { SiteBaseline } from '../../../lib/site';
import { FINDING_TONE } from '../../kit';
import { CHECK_LABEL, kwFmt, linkedPlanUrl, muted } from './helpers';

const STATUS = { pass: 'Pass', fail: 'Fail', warn: 'Warn', 'n/a': 'Not checked' } as const;

/** The in-site checks for this step, read from the plan's analysis. */
export function ChecksBlock({ a, keys }: { a?: InSiteAnalysis; keys: string[] }) {
  const rows = keys.map(k => [k, a?.checks[k]] as const).filter(([, c]) => !!c);
  if (!rows.length) return null;
  return (
    <div className="col" style={{ gap: 0, marginTop: 8 }}>
      {rows.map(([k, c]) => (
        <div key={k} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 13, alignItems: 'flex-start' }}>
          <span style={{ minWidth: 92 }}><Chip tone={FINDING_TONE[c!.status]} dot>{STATUS[c!.status]}</Chip></span>
          <span className="strong" style={{ minWidth: 130 }}>{CHECK_LABEL[k] ?? k}</span>
          <span className="vw-label" style={{ flex: 1, minWidth: 0 }}>{c!.detail}</span>
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
      <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
        <thead><tr><th>Stage</th><th>Redundancy</th><th className="is-right">Usable</th><th className="is-right">Load</th><th className="is-right">IT headroom</th><th className="is-right">After this plan</th><th>Basis</th></tr></thead>
        <tbody>{stages.map(s => { const after = Math.round((s.headroomItKw - addKw) * 10) / 10; const bind = site.binding?.key === s.key; return (
          <tr key={s.key} className={bind ? 'is-selected' : undefined}>
            <td><span className="row" style={{ gap: 6 }}><span className="strong">{s.label}</span>{bind && <Chip tone="warning" size="xs">binding</Chip>}</span></td><td>{s.redundancy}</td>
            <td className="is-right num">{kwFmt(s.usableKw)}{s.facility ? ' (facility)' : ''}</td><td className="is-right num">{kwFmt(s.loadKw)}</td>
            <td className="is-right num">{kwFmt(Math.max(0, s.headroomItKw))}</td><td className="is-right num" style={{ color: after < 0 ? 'var(--vw-color-red-600)' : undefined }}>{after < 0 ? `${kwFmt(-after)} short` : kwFmt(after)}</td>
            <td className="is-wrap"><span className="vw-label" style={{ fontSize: 12 }}>{s.basis}</span></td>
          </tr>); })}</tbody>
      </table></div></div>
      <div style={{ ...muted, marginTop: 4 }}>IT load today {kwFmt(site.itLoadKw)} · held by reservations {kwFmt(site.reservedKw)} · approved plans not yet holding capacity {kwFmt(site.pipelineKw)}{site.pipeline.length ? ` (${site.pipeline.map(p => p.plnId).join(', ')})` : ''} · PUE {site.pue} ({site.pueSource}){site.dcPlant ? ' · −48 V DC power plant' : ''}</div>
    </div>
  );
}

/** When the site cannot take the plan: by how much, and a pre-filled linked plant (or expansion) plan. */
export function ShortfallBanner({ a, plan }: { a?: InSiteAnalysis; plan: T.PlannerPlan }) {
  const nav = useNavigate();
  const s = a?.shortfall; if (!s) return null;
  return (
    <div className="note note--bad" style={{ alignItems: 'center' }}>
      <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <span className="row wrap" style={{ gap: 6 }}><Chip tone="error" dot>Does not fit</Chip><strong>Short of {s.what} by {kwFmt(s.kw)}</strong></span>
        <span>{s.plantIntent}. The new plan opens in the wizard with this shortfall as its intent; approve it before this one.</span>
      </div>
      <Btn variant="filled" icon={Plus} onClick={() => nav(linkedPlanUrl(s, plan))}>Create a linked {s.expansion ? 'expansion' : 'plant'} plan</Btn>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) { return <div style={{ ...muted, marginTop: 6 }}>{children}</div>; }
