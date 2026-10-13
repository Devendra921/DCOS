/* Standard changes tab: the catalogue of pre-approved change templates. Work that a template covers,
   inside its limits, raises a standard change that is approved at once and skips the board.
   A failed standard change suspends its template until it is reviewed. Each template's kit (the
   materials every work order under it takes) is shown read-only. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Drawer, Input, Modal } from 'antd';
import { BookCheck } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Btn, Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import type { DeliveryData } from '../../../delivery/lib/chain';
import { CHANGE_TYPE_LABEL, WO_TYPE_LABEL, fmtDay, siteLabel, type ChangeRow } from '../../lib/model';
import { useChainActions as useChangeLocalActions } from '../../../delivery/lib/workflowChain';
import { KvList, Muted, Note, StatusChip, WoStatusChip } from '../kit';
import { useMaterialData } from '../../../delivery/lib/materialHooks';
import { fmtQty } from '../../../delivery/lib/materialRules';

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

  type Row = T.StandardChangeTemplate & { overdue: boolean };
  const cols: Col<Row>[] = [
    { key: 'name', header: 'Template', wrap: true, sort: t => t.name, render: t => <span className="cell-2"><span className="vw-card-activity-label">{t.name}</span><small className="mono">{t.stdId ?? t.id}</small></span> },
    { key: 'wt', header: 'Work types', wrap: true, render: t => t.workTypes.map(w => WO_TYPE_LABEL[w] ?? w).join(', ') },
    { key: 'lim', header: 'Limits', wrap: true, render: t => limitsText(t) },
    { key: 'kit', header: 'Kit', align: 'right', sort: t => t.kit?.length ?? 0, render: t => (t.kit?.length ? <span className="num">{t.kit.length} item{t.kit.length === 1 ? '' : 's'}</span> : <Muted>none</Muted>) },
    { key: 'owner', header: 'Owner', sort: t => t.owner, render: t => t.owner },
    { key: 'rev', header: 'Review due', sort: t => t.reviewDue, render: t => <span className="num" style={{ color: t.overdue ? 'var(--vw-color-amber-700)' : undefined }}>{fmtDay(t.reviewDue)}{t.overdue ? ' (overdue)' : ''}</span> },
    { key: 'used', header: 'Used', align: 'right', sort: t => t.usedCount, render: t => <span className="num">{t.usedCount}</span> },
    { key: 'failed', header: 'Failed', align: 'right', sort: t => t.failedCount, render: t => <span className="num" style={{ color: t.failedCount ? 'var(--vw-color-red-600)' : undefined }}>{t.failedCount}</span> },
    { key: 'st', header: 'Status', sort: t => t.status, render: t => <Chip tone={TPL_TONE[t.status]} dot>{t.status}</Chip> },
  ];

  return (
    <Panel title="Standard change templates" icon={BookCheck} count={`${templates.filter(t => t.status === 'Active').length} active of ${templates.length}`} flush
      sub="A standard change is pre-approved: it needs no change board. Each template has an owner and a yearly review. If a standard change fails, its template is suspended and matching work goes as normal changes until the owner reviews it.">
      <DataTable<Row> rows={templates.map(t => ({ ...t, overdue: t.status === 'Active' && t.reviewDue < now }))} cols={cols} onRow={t => setOpen(t.id)} pageSize={25}
        empty={<Empty icon={BookCheck} title="No standard change templates yet">The change manager adds templates for low-risk, repeatable work (for example a rack install inside an existing row); until then every change goes as a normal change.</Empty>} />
      <TemplateDrawer t={open} d={d} rows={rows} onClose={() => setOpen()} />
    </Panel>
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
  const md = useMaterialData();
  const mats = useMemo(() => new Map(md.materials.map(m => [m.id, m])), [md.materials]);
  if (!t) return null;
  const verb = { Active: 'Reactivate', Suspended: 'Suspend', Retired: 'Retire' } as const;
  const help = { Active: 'Matching work raises standard changes again. Record what the review found.', Suspended: 'Matching work goes as normal changes until the template is reactivated.', Retired: 'The template is withdrawn for good. Matching work goes as normal changes.' } as const;
  const confirm = () => { if (!ask || reason.trim().length < 3) return; actions.setTemplateStatus(t.id, ask, reason.trim()); message.success(`${t.name}: ${ask.toLowerCase()}`); setAsk(null); setReason(''); };

  return (
    <Drawer open onClose={onClose} width={640} title={t.name} extra={<Chip tone={TPL_TONE[t.status]} dot>{t.status}</Chip>}>
      <div className="col" style={{ gap: 16 }}>
        <p style={{ margin: 0 }}>{t.description}</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {t.status !== 'Active' && t.status !== 'Retired' && <Btn variant="filled" onClick={() => setAsk('Active')}>Reactivate</Btn>}
          {t.status === 'Active' && <Btn onClick={() => setAsk('Suspended')}>Suspend</Btn>}
          {t.status !== 'Retired' && <Btn variant="danger-subtle" onClick={() => setAsk('Retired')}>Retire</Btn>}
        </div>
        {t.status === 'Suspended' && <Note tone="warn">Suspended{t.lastFailureAt ? ` after a failure on ${fmtDay(t.lastFailureAt)}` : ''}. Matching work goes as normal changes until the owner reviews and reactivates it.</Note>}
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
          <h3 className="strong" style={{ margin: '0 0 6px', fontSize: 14 }}>Steps</h3>
          {t.steps.length ? <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{t.steps.map((s, i) => <li key={i} style={{ padding: '2px 0' }}>{s}</li>)}</ol> : <Muted>No steps recorded.</Muted>}
        </div>
        <div>
          <h3 className="strong" style={{ margin: '0 0 6px', fontSize: 14 }}>Kit</h3>
          {!t.kit?.length ? <Muted>No kit. Work orders under this template take the default kit for their kind of work.</Muted> : (
            <div className="col" style={{ gap: 6 }}>
              <Muted>Every work order raised under this template takes these items; more can be added on the work order.</Muted>
              <DataTable compact rows={t.kit.map(k => ({ ...k, id: k.materialId }))} pageSize={50} cols={[
                { key: 'item', header: 'Item', wrap: true, render: k => mats.get(k.materialId)?.description ?? k.materialId },
                { key: 'pn', header: 'Part number', render: k => <span className="mono">{mats.get(k.materialId)?.partNumber ?? '—'}</span> },
                { key: 'qty', header: 'Quantity', align: 'right', render: k => { const m = mats.get(k.materialId); return <span className="num">{m ? fmtQty(k.quantity, m.uom) : k.quantity}</span>; } },
              ]} />
            </div>
          )}
        </div>
        <KvList items={[{ label: 'Backout', value: t.backout || '—' }]} />
        <div>
          <h3 className="strong" style={{ margin: '0 0 6px', fontSize: 14 }}>Work orders that used it</h3>
          {used.length === 0 ? <Muted>No work order has used this template yet.</Muted> : (
            <DataTable compact rows={used.map((u, i) => ({ ...u, id: u.wo?.id ?? u.row?.c.id ?? String(i) }))} pageSize={50} cols={[
              { key: 'wo', header: 'Work order', render: ({ wo }) => (wo ? <Link className="ent-link mono" to={`/delivery/work-orders/${wo.id}`}>{wo.id}</Link> : <Muted>none</Muted>) },
              { key: 'chg', header: 'Change', render: ({ row }) => (row ? <Link className="ent-link mono" to={`/changes/${row.c.id}`}>{row.c.id}</Link> : <Muted>—</Muted>) },
              { key: 'site', header: 'Site', render: ({ wo, row }) => siteLabel(sites.get(wo?.dataCenterId ?? row?.c.dataCenterId ?? '')) },
              { key: 'date', header: 'Date', render: ({ wo, row }) => <span className="num">{fmtDay(wo?.plannedStart ?? row?.start)}</span> },
              { key: 'st', header: 'Status', render: ({ wo, row }) => (row ? <StatusChip status={row.c.status} /> : wo ? <WoStatusChip status={wo.status} /> : null) },
            ]} />
          )}
        </div>
      </div>
      <Modal open={!!ask} title={ask ? `${verb[ask]} ${t.name}` : ''} onCancel={() => setAsk(null)} onOk={confirm} okText={ask ? verb[ask] : 'OK'} okButtonProps={{ danger: ask === 'Retired', disabled: reason.trim().length < 3 }}>
        <div className="col" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}>{ask ? help[ask] : ''}</p>
          <label htmlFor="tpl-reason" style={{ fontSize: 13 }}>Reason (required)</label>
          <Input.TextArea id="tpl-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </Modal>
    </Drawer>
  );
}
