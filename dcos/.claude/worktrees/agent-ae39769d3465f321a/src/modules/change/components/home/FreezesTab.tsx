/* Freezes tab: periods in which only emergency changes may be implemented, per site or estate-wide.
   Add, edit or remove a freeze; the table shows which open changes fall inside each one. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { PlusOutlined } from '../../../../shared/icons';
import { PEOPLE } from '../../../../mock/db/seed/ctx';
import { isOpenChange } from '../../../delivery/lib/chain';
import { fmtWhen, siteLabel, type ChangeRow } from '../../lib/model';
import { useChangeLocalActions } from '../../lib/actions';
import { Muted } from '../kit';

const overlaps = (a0: string, a1: string, b0: string, b1: string) => a0 < b1 && b0 < a1;
interface FormValues { name: string; site: string; range: [Dayjs, Dayjs]; allows: T.ChangeFreeze['allows']; reason: string; owner: string }

export function FreezesTab({ freezes, sites, rows }: { freezes: T.ChangeFreeze[]; sites: T.DataCenter[]; rows: ChangeRow[] }) {
  const actions = useChangeLocalActions();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState<T.ChangeFreeze | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();
  const now = new Date().toISOString();
  const siteById = useMemo(() => new Map(sites.map(s => [s.id, s])), [sites]);
  const list = useMemo(() => [...freezes].sort((a, b) => {
    const ra = a.end < now ? 2 : a.start <= now ? 0 : 1, rb = b.end < now ? 2 : b.start <= now ? 0 : 1;
    return ra - rb || (ra === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start));
  }), [freezes, now]);
  const inside = (f: T.ChangeFreeze) => rows.filter(r => isOpenChange(r.c) && r.start && (!f.dataCenterId || r.site?.id === f.dataCenterId) && overlaps(r.start, r.end ?? r.start, f.start, f.end));

  const openForm = (f: T.ChangeFreeze | 'new') => {
    setEditing(f);
    if (f === 'new') form.setFieldsValue({ name: '', site: 'all', range: [dayjs().add(7, 'day').startOf('day'), dayjs().add(14, 'day').endOf('day')], allows: 'Emergency only', reason: '', owner: 'Nina Patel' });
    else form.setFieldsValue({ name: f.name, site: f.dataCenterId ?? 'all', range: [dayjs(f.start), dayjs(f.end)], allows: f.allows, reason: f.reason, owner: f.owner });
  };
  const save = async () => {
    const v = await form.validateFields().catch(() => null); if (!v) return;
    const input = { name: v.name.trim(), dataCenterId: v.site === 'all' ? undefined : v.site, start: v.range[0].toISOString(), end: v.range[1].toISOString(), allows: v.allows, reason: v.reason.trim(), owner: v.owner };
    actions.saveFreeze(input, editing && editing !== 'new' ? editing.id : undefined);
    message.success(editing === 'new' ? 'Freeze added' : 'Freeze updated');
    setEditing(null);
  };
  const remove = (f: T.ChangeFreeze) => modal.confirm({ title: `Remove ${f.name}?`, content: 'Changes in this period are no longer held back by it. The removal is kept in the audit trail.', okText: 'Remove freeze', okButtonProps: { danger: true }, onOk: () => { actions.removeFreeze(f.id); message.info('Freeze removed'); } });

  return (
    <VwCard title="Change freezes" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openForm('new')}>Add freeze</Button>}>
      <div className="vw-card-description" style={{ marginBottom: 8 }}>During a freeze only emergency changes may be implemented. A freeze applies to one site or to every site. A normal or standard change whose window falls in a freeze must move its window or go as an emergency.</div>
      {list.length === 0 ? <div className="vw-card-description" style={{ padding: '16px 0' }}>No freezes. Add one for peak trading periods, audits or major events at a site.</div> : (
        <div className="nst-table-wrap">
          <table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Freeze</th><th>Applies to</th><th>From</th><th>To</th><th>Allows</th><th>Owner</th><th>Status</th><th>Open changes inside</th><th /></tr></thead>
            <tbody>{list.map(f => {
              const st = f.end < now ? 'Past' : f.start <= now ? 'In force' : 'Upcoming';
              const inn = inside(f);
              return (
                <tr key={f.id}>
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}><div style={{ color: 'var(--vw-color-slate-900)' }}>{f.name}</div><Muted size="xs">{f.reason}</Muted></td>
                  <td>{f.dataCenterId ? siteLabel(siteById.get(f.dataCenterId)) : 'All sites'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(f.start)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(f.end)}</td>
                  <td>{f.allows === 'None' ? 'No changes' : 'Emergency only'}</td>
                  <td>{f.owner}</td>
                  <td><VwChip variant={st === 'In force' ? 'warning' : st === 'Upcoming' ? 'info' : 'neutral'}>{st}</VwChip></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{inn.length === 0 ? <Muted>none</Muted> : <>{inn.slice(0, 3).map((r, i) => <span key={r.c.id}>{i > 0 && ', '}<Link to={`/changes/${r.c.id}`}>{r.c.id}</Link></span>)}{inn.length > 3 && <Muted> and {inn.length - 3} more</Muted>}</>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="vw-inline-flex vw-gap-xs">
                      <button type="button" className="nst-btn nst-btn--sm" onClick={() => openForm(f)}>Edit</button>
                      <button type="button" className="nst-btn nst-btn--sm nst-btn--danger-subtle" onClick={() => remove(f)}>Remove</button>
                    </span>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} title={editing === 'new' ? 'Add a freeze' : 'Edit freeze'} onCancel={() => setEditing(null)} onOk={() => void save()} okText={editing === 'new' ? 'Add freeze' : 'Save'} forceRender>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the freeze a name' }]}><Input placeholder="e.g. Year-end trading freeze" /></Form.Item>
          <Form.Item name="site" label="Applies to" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={[{ value: 'all', label: 'All sites' }, ...sites.map(s => ({ value: s.id, label: `${siteLabel(s)} · ${s.name}` }))]} />
          </Form.Item>
          <Form.Item name="range" label="From and to" rules={[{ required: true, message: 'Pick the start and end' }]}><DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="D MMM YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="allows" label="Allows" rules={[{ required: true }]}><Select options={[{ value: 'Emergency only', label: 'Emergency changes only' }, { value: 'None', label: 'No changes at all' }]} /></Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Say why the estate is frozen' }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="owner" label="Owner" rules={[{ required: true }]}><Select showSearch options={PEOPLE.map(p => ({ value: p.name, label: `${p.name} · ${p.role}` }))} /></Form.Item>
        </Form>
      </Modal>
    </VwCard>
  );
}
