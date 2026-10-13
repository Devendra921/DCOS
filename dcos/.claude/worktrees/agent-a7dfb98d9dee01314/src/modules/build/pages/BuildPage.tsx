import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Spin, Space, Modal, Form, Input, Select } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { InboxOutlined, SyncOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { useEntityList, useEntityUpdate, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { WORK_ORDER_TYPE } from '../../../mock/data/enums';
import { KPICard } from '../../../shared/components/KPICard';
import type { WorkOrder, Project } from '../../../mock/data/types';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';
const COLS = ['Assigned', 'InProgress', 'Validated', 'Completed'];
const statusColor: Record<string, string> = { Assigned: 'blue', InProgress: 'gold', Validated: 'cyan', Completed: 'green' };
export default function BuildPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'Board' | 'Table'>('Board');
  const wos = (useEntityList('workOrders', { pageSize: 200 }).data?.data ?? []) as unknown as WorkOrder[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const { message } = App.useApp();
  const update = useEntityUpdate('workOrders');
  const create = useEntityCreate('workOrders');
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const WOFLOW = ['Assigned', 'InProgress', 'Validated', 'Completed'];
  const advance = (w: WorkOrder) => { const i = WOFLOW.indexOf(w.status); const to = i < WOFLOW.length - 1 ? WOFLOW[i + 1] : null; if (!to) return; update.mutate({ id: w.id, data: { status: to } }, { onSuccess: () => { message.success(`${w.woId} → ${to}`); audit('WorkOrder', w.woId, to, `${w.type} → ${to}`); } }); };
  const submitNew = async () => { const v = await form.validateFields(); const id = `WO-NEW-${Date.now().toString().slice(-4)}`; const now = new Date().toISOString(); create.mutate({ id, woId: id, type: v.type, rackId: v.rackId, assigneeName: v.assigneeName, status: 'Assigned', scheduledDate: now, customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' }, { onSuccess: () => { message.success('Work order created'); audit('WorkOrder', id, 'created', `Created ${v.type}`); setOpen(false); } }); };
  const m = useMemo(() => ({
    open: wos.filter((w) => w.status !== 'Completed').length,
    inprog: wos.filter((w) => w.status === 'InProgress').length,
    done: wos.filter((w) => w.status === 'Completed').length,
  }), [wos]);
  const wosReveal = useScrollReveal(wos, 25);
  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div className="vw-page-title" role="heading" aria-level={3}>Build &amp; Deploy</div>
        <Space><Button type="primary" onClick={() => setOpen(true)}>New work order</Button><VwSegmented value={view} onChange={(v) => setView(v as 'Board' | 'Table')} options={['Board', 'Table']} /></Space>
      </div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Open Work Orders" value={m.open} icon={<InboxOutlined />} iconTone="info" />
        <KPICard title="In Progress" value={m.inprog} icon={<SyncOutlined />} iconTone="cyan" />
        <KPICard title="Completed" value={m.done} icon={<CheckCircleOutlined />} iconTone="success" />
      </div>
      {view === 'Board' ? (
        <div style={{ display: 'flex', gap: "var(--vw-space-md)", overflowX: 'auto', paddingBottom: "var(--vw-space-xxs)" }}>
          {COLS.map((col) => {
            const items = wos.filter((w) => w.status === col);
            return (
              <div key={col} style={{ flex: '0 0 260px', width: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", marginBottom: "var(--vw-space-sm)" }}>
                  <span style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: "var(--vw-color-slate-500)" }}>{col}</span>
                  <VwChip>{items.length}</VwChip>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--vw-space-sm)", maxHeight: 560, overflowY: 'auto', paddingRight: 2 }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-400)", textAlign: 'center', padding: '16px 0' }}>No work orders</div>
                  ) : items.map((w) => (
                    <VwCard key={w.id} size="small" hoverable bodyStyle={{ padding: 10 }}
                      onClick={() => w.rackId && navigate(`/facility/racks/${w.rackId}`)}>
                      <div style={{ fontSize: "var(--vw-font-label-sm)" }}>{w.type}</div>
                      <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{w.assigneeName} · {w.rackId}</div>
                      {w.projectId && <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-blue-600)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projName[w.projectId] ?? 'Project'}</div>}
                    </VwCard>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
            Showing {wosReveal.visible.length} of {wosReveal.total} work orders
          </div>
          <VwCard bodyStyle={{ padding: 0 }}>
            <Table<WorkOrder> size="small" rowKey="id" dataSource={wosReveal.visible} pagination={false} sticky={TABLE_STICKY} scroll={{ x: 'max-content' }}
              columns={[{ title: 'WO', dataIndex: 'woId' }, { title: 'Type', dataIndex: 'type', render: (t) => <VwChip>{t}</VwChip> }, { title: 'Project', dataIndex: 'projectId', render: (id?: string) => id ? <a onClick={() => navigate(`/delivery/projects/${id}`)}>{projName[id] ?? 'Project'}</a> : '—' }, { title: 'Rack', dataIndex: 'rackId' }, { title: 'Assignee', dataIndex: 'assigneeName' }, { title: 'Scheduled', dataIndex: 'scheduledDate', render: (d: string) => d.slice(0, 10) }, { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={statusColor[s]}>{s}</VwChip> }, { title: '', render: (_, w) => w.status !== 'Completed' ? <Button size="small" onClick={() => advance(w)}>Advance</Button> : null }]} />
            {wosReveal.visible.length > 0 && wosReveal.hasMore && (
              <div ref={wosReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
                <Spin size="small" />
              </div>
            )}
          </VwCard>
        </>
      )}
      <Modal title="New work order" open={open} onOk={submitNew} onCancel={() => setOpen(false)} okText="Create" destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'RackInstall' }}>
          <Form.Item name="type" label="Type"><Select placeholder="Select type" options={WORK_ORDER_TYPE.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="rackId" label="Rack ID"><Input placeholder="RACK-0001" /></Form.Item>
          <Form.Item name="assigneeName" label="Assignee" rules={[{ required: true }]}><Input placeholder="Enter assignee" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
