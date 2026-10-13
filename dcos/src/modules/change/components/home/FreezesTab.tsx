/* Freezes tab: periods in which only emergency changes may be implemented, per site or estate-wide.
   Add, edit or remove a freeze; the table shows which open changes fall inside each one. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type * as T from '../../../../mock/data/types';
import { Plus, Snowflake } from 'lucide-react';
import { Btn, Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { PEOPLE } from '../../../../mock/db/seed/ctx';
import { isOpenChange } from '../../../delivery/lib/chain';
import { fmtWhen, siteLabel, type ChangeRow } from '../../lib/model';
import { useChainActions as useChangeLocalActions } from '../../../delivery/lib/workflowChain';
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

  type Row = T.ChangeFreeze & { st: 'Past' | 'In force' | 'Upcoming'; inn: ChangeRow[] };
  const rowsView: Row[] = list.map(f => ({ ...f, st: f.end < now ? 'Past' : f.start <= now ? 'In force' : 'Upcoming', inn: inside(f) }));
  const cols: Col<Row>[] = [
    { key: 'name', header: 'Freeze', wrap: true, sort: f => f.name, render: f => <span className="cell-2"><span className="vw-card-activity-label">{f.name}</span><small>{f.reason}</small></span> },
    { key: 'site', header: 'Applies to', sort: f => (f.dataCenterId ? siteLabel(siteById.get(f.dataCenterId)) : 'All sites'), render: f => (f.dataCenterId ? siteLabel(siteById.get(f.dataCenterId)) : 'All sites') },
    { key: 'from', header: 'From', sort: f => f.start, render: f => <span className="num">{fmtWhen(f.start)}</span> },
    { key: 'to', header: 'To', sort: f => f.end, render: f => <span className="num">{fmtWhen(f.end)}</span> },
    { key: 'allows', header: 'Allows', render: f => (f.allows === 'None' ? 'No changes' : 'Emergency only') },
    { key: 'owner', header: 'Owner', sort: f => f.owner, render: f => f.owner },
    { key: 'st', header: 'Status', sort: f => f.st, render: f => <Chip tone={f.st === 'In force' ? 'warning' : f.st === 'Upcoming' ? 'info' : 'neutral'} dot>{f.st}</Chip> },
    { key: 'inn', header: 'Open changes inside', wrap: true, sort: f => f.inn.length, render: f => (f.inn.length === 0 ? <Muted>none</Muted> : <span>{f.inn.slice(0, 3).map((r, i) => <span key={r.c.id}>{i > 0 && ', '}<Link className="ent-link mono" to={`/changes/${r.c.id}`}>{r.c.id}</Link></span>)}{f.inn.length > 3 && <Muted> and {f.inn.length - 3} more</Muted>}</span>) },
    { key: 'act', header: '', align: 'right', render: f => (
      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="xs" onClick={() => openForm(f)}>Edit</Btn>
        <Btn size="xs" variant="danger-subtle" onClick={() => remove(f)}>Remove</Btn>
      </span>
    ) },
  ];

  return (
    <Panel title="Change freezes" icon={Snowflake} count={list.length} flush
      sub="During a freeze only emergency changes may be implemented. A freeze applies to one site or to every site. A normal or standard change whose window falls in a freeze must move its window or go as an emergency."
      actions={<Btn variant="filled" icon={Plus} onClick={() => openForm('new')}>Add freeze</Btn>}>
      <DataTable<Row> rows={rowsView} cols={cols} pageSize={25}
        empty={<Empty icon={Snowflake} title="No freezes">Add one for peak trading periods, audits or major events at a site.</Empty>} />

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
    </Panel>
  );
}
