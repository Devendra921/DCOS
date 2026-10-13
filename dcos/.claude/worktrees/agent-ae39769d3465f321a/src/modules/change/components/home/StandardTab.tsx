/* Standard changes tab: the catalogue of pre-approved change templates. Work that a template covers,
   inside its limits, raises a standard change that is approved at once and skips the board.
   A failed standard change suspends its template until it is reviewed. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Drawer, Input, Modal } from 'antd';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import type { DeliveryData } from '../../../delivery/lib/chain';
import { CHANGE_TYPE_LABEL, WO_TYPE_LABEL, fmtDay, siteLabel, type ChangeRow } from '../../lib/model';
import { useChangeLocalActions } from '../../lib/actions';
import { KvList, Muted, StatusChip, WoStatusChip } from '../kit';

const TPL_TONE = { Active: 'success', Suspended: 'warning', Retired: 'neutral' } as const;
const limitsText = (t: T.StandardChangeTemplate) => [
  t.limits.maxKw !== undefined && `up to ${t.limits.maxKw} kW`, t.limits.maxDevices !== undefined && `up to ${t.limits.maxDevices} devices`,
  !t.limits.criticalServicesAllowed && 'no critical service', !t.limits.liveSiteAllowed && 'not in a live area',
].filter(Boolean).join(', ') || 'No limits';

export function StandardTab({ d, rows }: { d: DeliveryData; rows: ChangeRow[] }) {
  const [sp, setSp] = useSearchParams();
  const openId = sp.get('template');
  const setOpen = (id?: string) => { const n = new URLSearchParams(sp); if (id) n.set('template', id); else n.delete('template'); setSp(n, { replace: true }); };
  const templates = useMemo(() => [...d.standardChangeTemplates].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'Active' ? -1 : b.status === 'Active' ? 1 : a.status.localeCompare(b.status))), [d.standardChangeTemplates]);
  const now = new Date().toISOString();
  const open = templates.find(t => t.id === openId);

  return (
    <VwCard title="Standard change templates" extra={<Muted>{templates.filter(t => t.status === 'Active').length} active of {templates.length}</Muted>}>
      <div className="vw-card-description" style={{ marginBottom: 8 }}>A standard change is pre-approved: it needs no change board. Each template has an owner and a yearly review. If a standard change fails, its template is suspended and matching work goes as normal changes until the owner reviews it.</div>
      {templates.length === 0 ? <div className="vw-card-description" style={{ padding: '16px 0' }}>No standard change templates yet. The change manager adds templates for low-risk, repeatable work (for example a rack install inside an existing row); until then every change goes as a normal change.</div> : (
        <div className="nst-table-wrap">
          <table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Template</th><th>Work types</th><th>Limits</th><th>Owner</th><th>Review due</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Failed</th><th>Status</th></tr></thead>
            <tbody>{templates.map(t => {
              const overdue = t.status === 'Active' && t.reviewDue < now;
              return (
                <tr key={t.id} className="is-clickable" onClick={() => setOpen(t.id)}>
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}><a onClick={e => { e.preventDefault(); setOpen(t.id); }} href={`?tab=standard&template=${t.id}`}>{t.name}</a><div><Muted size="xs">{t.stdId ?? t.id}</Muted></div></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{t.workTypes.map(w => WO_TYPE_LABEL[w] ?? w).join(', ')}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 240 }}>{limitsText(t)}</td>
                  <td>{t.owner}</td>
                  <td style={{ color: overdue ? 'var(--vw-color-amber-700)' : undefined }}>{fmtDay(t.reviewDue)}{overdue ? ' (overdue)' : ''}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.usedCount}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.failedCount ? 'var(--vw-color-red-600)' : undefined }}>{t.failedCount}</td>
                  <td><VwChip variant={TPL_TONE[t.status]}>{t.status}</VwChip></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <TemplateDrawer t={open} d={d} rows={rows} onClose={() => setOpen()} />
    </VwCard>
  );
}

function TemplateDrawer({ t, d, rows, onClose }: { t?: T.StandardChangeTemplate; d: DeliveryData; rows: ChangeRow[]; onClose: () => void }) {
  const actions = useChangeLocalActions();
  const { message } = App.useApp();
  const [ask, setAsk] = useState<T.StandardChangeTemplate['status'] | null>(null);
  const [reason, setReason] = useState('');
  const used = useMemo(() => {
    if (!t) return [];
    const byWo = new Map<string, { wo?: T.WorkOrder; row?: ChangeRow }>();
    for (const w of d.workOrders) if (w.standardTemplateId === t.id) byWo.set(w.id, { wo: w });
    for (const r of rows) if (r.c.standardTemplateId === t.id) { const k = r.wo?.id ?? r.c.id; byWo.set(k, { wo: r.wo ?? byWo.get(k)?.wo, row: r }); }
    for (const [k, v] of byWo) if (!v.row) byWo.set(k, { ...v, row: rows.find(r => r.wo?.id === k) });
    return [...byWo.values()].sort((a, b) => (b.wo?.plannedStart ?? b.row?.start ?? '').localeCompare(a.wo?.plannedStart ?? a.row?.start ?? ''));
  }, [t, d.workOrders, rows]);
  const sites = useMemo(() => new Map(d.dataCenters.map(s => [s.id, s])), [d.dataCenters]);
  if (!t) return null;
  const verb = { Active: 'Reactivate', Suspended: 'Suspend', Retired: 'Retire' } as const;
  const help = { Active: 'Matching work raises standard changes again. Record what the review found.', Suspended: 'Matching work goes as normal changes until the template is reactivated.', Retired: 'The template is withdrawn for good. Matching work goes as normal changes.' } as const;
  const confirm = () => { if (!ask || reason.trim().length < 3) return; actions.setTemplateStatus(t.id, ask, reason.trim()); message.success(`${t.name}: ${ask.toLowerCase()}`); setAsk(null); setReason(''); };

  return (
    <Drawer open onClose={onClose} width={640} title={t.name} extra={<VwChip variant={TPL_TONE[t.status]}>{t.status}</VwChip>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{t.description}</div>
        <div className="vw-flex vw-gap-sm vw-wrap">
          {t.status !== 'Active' && t.status !== 'Retired' && <Button type="primary" onClick={() => setAsk('Active')}>Reactivate</Button>}
          {t.status === 'Active' && <Button onClick={() => setAsk('Suspended')}>Suspend</Button>}
          {t.status !== 'Retired' && <Button danger onClick={() => setAsk('Retired')}>Retire</Button>}
        </div>
        {t.status === 'Suspended' && <VwCard variant="child" tone="warning"><div className="vw-card-description">Suspended{t.lastFailureAt ? ` after a failure on ${fmtDay(t.lastFailureAt)}` : ''}. Matching work goes as normal changes until the owner reviews and reactivates it.</div></VwCard>}
        <KvList items={[
          { label: 'Work types', value: t.workTypes.map(w => WO_TYPE_LABEL[w] ?? w).join(', ') },
          { label: 'Change type', value: CHANGE_TYPE_LABEL[t.changeType] ?? t.changeType },
          { label: 'Limits', value: limitsText(t) },
          { label: 'Owner', value: t.owner },
          { label: 'Approved', value: fmtDay(t.approvedAt) },
          { label: 'Review due', value: fmtDay(t.reviewDue) },
          { label: 'Used / failed', value: `${t.usedCount} / ${t.failedCount}${t.lastFailureAt ? ` (last failure ${fmtDay(t.lastFailureAt)})` : ''}` },
        ]} />
        <div>
          <div className="vw-card-title" style={{ marginBottom: 6 }}>Steps</div>
          {t.steps.length ? <ol style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-800)' }}>{t.steps.map((s, i) => <li key={i} style={{ padding: '2px 0' }}>{s}</li>)}</ol> : <Muted>No steps recorded.</Muted>}
        </div>
        <KvList items={[{ label: 'Backout', value: t.backout || '—' }]} />
        <div>
          <div className="vw-card-title" style={{ marginBottom: 6 }}>Work orders that used it</div>
          {used.length === 0 ? <Muted>No work order has used this template yet.</Muted> : (
            <div className="nst-table-wrap">
              <table className="nst-table" style={{ width: '100%' }}>
                <thead><tr><th>Work order</th><th>Change</th><th>Site</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>{used.map(({ wo, row }, i) => (
                  <tr key={wo?.id ?? row?.c.id ?? i}>
                    <td>{wo ? <Link to={`/delivery/work-orders/${wo.id}`}>{wo.id}</Link> : <Muted>none</Muted>}</td>
                    <td>{row ? <Link to={`/changes/${row.c.id}`}>{row.c.id}</Link> : <Muted>—</Muted>}</td>
                    <td>{siteLabel(sites.get(wo?.dataCenterId ?? row?.c.dataCenterId ?? ''))}</td>
                    <td>{fmtDay(wo?.plannedStart ?? row?.start)}</td>
                    <td>{row ? <StatusChip status={row.c.status} /> : wo ? <WoStatusChip status={wo.status} /> : null}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Modal open={!!ask} title={ask ? `${verb[ask]} ${t.name}` : ''} onCancel={() => setAsk(null)} onOk={confirm} okText={ask ? verb[ask] : 'OK'} okButtonProps={{ danger: ask === 'Retired', disabled: reason.trim().length < 3 }}>
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description">{ask ? help[ask] : ''}</div>
          <label htmlFor="tpl-reason" style={{ fontSize: 'var(--vw-font-label-sm)' }}>Reason (required)</label>
          <Input.TextArea id="tpl-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </Modal>
    </Drawer>
  );
}
