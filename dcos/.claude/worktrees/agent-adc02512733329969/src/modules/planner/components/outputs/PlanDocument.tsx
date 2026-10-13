/* Plan document: the basis of design as a clean, printable document with a title block. */
import type * as T from '../../../../mock/data/types';
import { VwCard, fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DownloadOutlined, FileTextOutlined } from '../../../../shared/icons';
import { SCOPE_LABEL } from '../../lib/engine';
import type { BodSection } from '../../lib/outputs';
import { bodHtml, downloadText, printPlanArea, type DocHeader } from './packModel';

const labelStyle = { fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4 } as const;

export function PlanDocument({ plan, template, sections, siteName }: { plan: T.PlannerPlan; template?: T.PlannerTemplate; sections: BodSection[]; siteName: string }) {
  const approvers = (template?.approvalPath ?? []).map(step => { const a = plan.approvals.find(x => x.step === step); return a?.person ? `${step} (${a.person})` : step; });
  const header: DocHeader = {
    title: plan.title, planId: plan.plnId, revision: 'A', status: plan.status, date: fmtDate(plan.updatedAt), owner: plan.ownerName,
    approvers, site: siteName, planType: template?.name ?? SCOPE_LABEL[plan.scope],
  };
  const titleBlock: { label: string; value: string; wide?: boolean }[] = [
    { label: 'Plan', value: header.planId }, { label: 'Revision', value: header.revision }, { label: 'Status', value: header.status }, { label: 'Date', value: header.date },
    { label: 'Owner', value: header.owner }, { label: 'Site', value: header.site }, { label: 'Plan type', value: header.planType }, { label: 'Approvers', value: approvers.join(' → ') || 'Design review, then budget approval' },
  ];

  return (
    <VwCard
      title="Basis of design"
      extra={<span className="vw-inline-flex vw-items-center vw-gap-xs">
        <Button size="small" icon={<FileTextOutlined />} onClick={printPlanArea}>Print</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadText(`${plan.plnId}-basis-of-design.html`, bodHtml(header, sections), 'text/html')}>Download as HTML</Button>
      </span>}
    >
      <div className="plan-print-area" style={{ maxWidth: 920, margin: '0 auto', color: 'var(--vw-color-slate-900)' }}>
        <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Basis of design</div>
        <div style={{ fontSize: 'var(--vw-font-heading-xl)', fontWeight: 600, lineHeight: 1.3, marginBottom: 'var(--vw-space-sm)' }}>{plan.title}</div>
        <div className="vw-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', border: '1px solid var(--vw-color-slate-300)', borderRadius: 'var(--vw-radius-sm)', overflow: 'hidden' }}>
          {titleBlock.map((c, i) => (
            <div key={c.label} style={{ padding: '6px 10px', borderRight: i % 4 === 3 ? 0 : '1px solid var(--vw-color-slate-200)', borderBottom: i < 4 ? '1px solid var(--vw-color-slate-200)' : 0, minWidth: 0 }}>
              <div style={labelStyle}>{c.label}</div>
              <div style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, overflowWrap: 'anywhere' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {sections.map(sec => (
          <section key={sec.id} style={{ marginTop: 'var(--vw-space-lg)', breakInside: 'avoid' }}>
            <div style={{ fontSize: 'var(--vw-font-heading-md)', fontWeight: 600, paddingBottom: 4, borderBottom: '1px solid var(--vw-color-slate-300)', marginBottom: 4 }}>{sec.title}</div>
            {sec.text && <p style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-700)', margin: '4px 0 6px' }}>{sec.text}</p>}
            {sec.rows.map((r, i) => (
              <div key={`${r.label}-${i}`} className="vw-grid" style={{ gridTemplateColumns: 'minmax(140px, 36%) minmax(0, 1fr)', columnGap: 'var(--vw-space-md)', padding: '3px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 'var(--vw-font-label-sm)' }}>
                <span style={{ color: 'var(--vw-color-slate-500)' }}>{r.label}</span>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {r.value}
                  {r.source && <span style={{ marginLeft: 8, fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>{r.source}</span>}
                </span>
              </div>
            ))}
          </section>
        ))}
        <section style={{ marginTop: 'var(--vw-space-lg)', breakInside: 'avoid' }}>
          <div style={{ fontSize: 'var(--vw-font-heading-md)', fontWeight: 600, paddingBottom: 4, borderBottom: '1px solid var(--vw-color-slate-300)', marginBottom: 4 }}>Approvals</div>
          {plan.approvals.length === 0
            ? <p style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-700)', margin: '4px 0 6px' }}>Not submitted for approval yet. The approval steps are set when the plan is submitted.</p>
            : (
              <div className="nst-table-wrap" style={{ marginTop: 4 }}><table className="nst-table" style={{ width: '100%' }}>
                <thead><tr><th>Step</th><th>Role</th><th>Person</th><th>On behalf of</th><th>Decision</th><th>Basis</th></tr></thead>
                <tbody>{[...plan.approvals].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((a, i) => (
                  <tr key={`${a.step}-${i}`}>
                    <td style={{ fontWeight: 500 }}>{a.step}</td>
                    <td>{a.role}</td>
                    <td>{a.person ?? '—'}</td>
                    <td>{a.onBehalfOf ?? '—'}</td>
                    <td>{a.decision}{a.at && <span style={{ marginLeft: 6, fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>{fmtDate(a.at)}</span>}</td>
                    <td style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)', whiteSpace: 'normal' }}>{a.basis ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
        </section>
        <div style={{ marginTop: 'var(--vw-space-lg)', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>Figures are indicative until the plan is approved. The source after a value says where it came from.</div>
      </div>
    </VwCard>
  );
}
