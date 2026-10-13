import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Empty, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { ShoppingOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowRightOutlined, SafetyCertificateOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useDeliverySnapshot, useDeliverSpine } from '../lib/deliverExec';
import { PERMIT_STATUS_COLOR, DESIGN_STATUS_COLOR } from '../lib/permits';
import ProcessDiagram from './ProcessDiagram';
import { AtpPanel, HotoPanel } from './commissioning';
import { TicketPanel } from './TicketPanel';
import { BomDetailDrawer } from '../../procurement/components/BomDetailDrawer';
import type { Project, BOM, ChangeRequest, ProjectActivity } from '../../../mock/data/types';

const { Text } = Typography;
const poColor: Record<string, string> = { Draft: 'default', Approved: 'blue', Ordered: 'gold', Received: 'green' };
const crColor: Record<string, string> = { Draft: 'default', Submitted: 'blue', Approved: 'cyan', Scheduled: 'gold', InProgress: 'gold', Implemented: 'green', Closed: 'green', Rejected: 'red', Cancelled: 'default' };

export default function ProjectDeliveryTab({ project }: { project: Project }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const snap = useDeliverySnapshot(project);
  const spine = useDeliverSpine();
  const [sel, setSel] = useState<ProjectActivity | null>(null);
  const [bomDetail, setBomDetail] = useState<BOM | null>(null);
  const crs = (useEntityList('changeRequests', { filters: [{ field: 'projectId', operator: 'eq', value: project.id }], pageSize: 200 }).data?.data ?? []) as unknown as ChangeRequest[];

  const selected = sel ?? snap.current ?? snap.activities[0] ?? null;
  const run = (label: string, fn: () => Promise<unknown>) => fn().then(() => message.success(`${label} done`)).catch((e) => message.error(String(e?.message ?? e)));

  // Primary action derives from the current activity.
  const cur = snap.current;
  let action: React.ReactNode;
  if (project.status === 'Completed') action = <VwChip color="green">Delivered &amp; live</VwChip>;
  else if (!cur) action = <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => run('Go-live', () => spine.goLive(project, snap))}>Go live — provision capacity</Button>;
  else if (cur.attaches === 'procurement' && !snap.procured) action = <Button type="primary" icon={<ShoppingOutlined />} onClick={() => run('Procurement', () => spine.generateProcurement(project))}>Generate procurement (BOM + POs)</Button>;
  else if (cur.attaches === 'commissioning' && snap.atps.length === 0) action = <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => run('ATP pack', () => spine.generateAtpPack(project))}>Generate ATP pack</Button>;
  else if (cur.attaches === 'hoto' && !snap.hoto) action = <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => run('Hand-over', () => spine.openHoto(project))}>Open hand-over package</Button>;
  else action = (
    <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => spine.advance(project, snap).then((r) => r.ok ? message.success(r.message) : message.warning(r.message))}>
      Complete “{cur.name}” &amp; advance
    </Button>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <VwCard size="small" title="Execution process" extra={<Text type="secondary">Stage: {snap.stage}</Text>}>
        <ProcessDiagram activities={snap.activities} selectedId={selected?.id} onSelect={(a) => setSel(a)} />
        <div style={{ marginTop: "var(--vw-space-sm)" }}>{action}</div>
      </VwCard>

      {(() => {
        const permitGate = snap.activities.find((a) => a.nodeType === 'gateway' && a.condition === 'permit');
        const designGate = snap.activities.find((a) => a.nodeType === 'gateway' && a.condition === 'design');
        const permitBlock = !!permitGate && permitGate.status !== 'Done' && !snap.permitsApproved;
        const designBlock = !!designGate && designGate.status !== 'Done' && !snap.designIssued;
        if (!permitBlock && !designBlock) return null;
        return (
          <Alert type="warning" showIcon message="Approvals gate not yet met — the build cannot pass this gate until it clears"
            description={<Space direction="vertical" size={2}>
              {permitBlock && <span>Permit gate: every required permit for this phase must be Approved. <a onClick={() => navigate('/delivery/permits')}>Open permits →</a></span>}
              {designBlock && <span>Design gate: a design package must be Issued for Construction. <a onClick={() => navigate('/delivery/design')}>Open design →</a></span>}
            </Space>} />
        );
      })()}

      {(snap.permits.length > 0 || snap.designDocs.length > 0) && (
        <VwCard size="small" title="Permits & design" extra={<Space size={8}>
          <VwChip color={snap.permits.length === 0 ? 'default' : snap.permitsApproved ? 'green' : 'gold'}>Permits {snap.permitsApproved ? 'approved' : snap.permits.length ? 'pending' : '—'}</VwChip>
          <VwChip color={snap.designDocs.length === 0 ? 'default' : snap.designIssued ? 'green' : 'gold'}>Design {snap.designIssued ? 'IFC' : snap.designDocs.length ? 'in progress' : '—'}</VwChip>
        </Space>}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {snap.permits.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: "var(--vw-space-sm)" }}>
                <Text style={{ fontSize: "var(--vw-font-label-md)" }}>{p.name} <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>· {p.authority}</Text></Text>
                <VwChip color={PERMIT_STATUS_COLOR[p.status]}>{p.status}</VwChip>
              </div>
            ))}
            {snap.designDocs.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: "var(--vw-space-sm)" }}>
                <Text style={{ fontSize: "var(--vw-font-label-md)" }}>{d.name} <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>· rev {d.revision}</Text></Text>
                <VwChip color={DESIGN_STATUS_COLOR[d.status]}>{d.status}</VwChip>
              </div>
            ))}
          </Space>
        </VwCard>
      )}

      {selected && (
        <VwCard size="small" title={<Space><Text strong>{selected.name}</Text><VwChip color={selected.status === 'Done' ? 'green' : selected.status === 'Active' ? 'blue' : 'default'}>{selected.status}</VwChip></Space>}>
          {selected.attaches === 'procurement' ? (
            snap.boms.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No BOM yet — generate procurement to begin." /> : (
              <>
                <Space style={{ marginBottom: "var(--vw-space-sm)" }} size={4}>{(['Approved', 'Ordered', 'Received'] as const).map((st) => { const n = snap.pos.filter((p) => p.status === st).length; return n ? <VwChip key={st} color={poColor[st]}>{n} {st}</VwChip> : null; })}</Space>
                <Table<BOM> size="small" rowKey="id" dataSource={snap.boms} pagination={false} onRow={(b) => ({ onClick: () => setBomDetail(b), style: { cursor: 'pointer' } })}
                  columns={[{ title: 'BOM', dataIndex: 'name' }, { title: 'Type', dataIndex: 'type', render: (t) => <VwChip>{t}</VwChip> }, { title: 'Lines', dataIndex: 'lineCount', align: 'right' }, { title: 'POs', key: 'p', align: 'right', render: (_: unknown, b) => snap.pos.filter((p) => p.bomId === b.id).length }, { title: 'Status', dataIndex: 'status', render: (s) => <VwChip>{s}</VwChip> }, { title: '', key: 'x', render: () => <a>Open & export</a> }]} scroll={{ x: 'max-content' }} />
              </>
            )
          ) : selected.attaches === 'commissioning' ? (
            <AtpPanel project={project} />
          ) : selected.attaches === 'hoto' ? (
            <HotoPanel project={project} hoto={snap.hoto} />
          ) : (
            <Text type="secondary">{selected.nodeType === 'gateway' ? 'Decision gate — clears automatically once its condition is met.' : selected.nodeType === 'end' ? 'Final handover — Go live provisions capacity and completes the project.' : 'Execution activity. Complete it to advance the process.'}</Text>
          )}
        </VwCard>
      )}

      {selected && selected.nodeType === 'task' && (
        <VwCard size="small">
          <TicketPanel anchor={{ projectId: project.id, activityId: selected.id }} title={`Tickets on “${selected.name}”`} dataCenterId={project.dataCenterId} />
        </VwCard>
      )}

      {crs.length > 0 && (
        <VwCard size="small" title="Change requests" extra={<Text type="secondary">{crs.filter((c) => ['Implemented', 'Closed'].includes(c.status)).length}/{crs.length} closed</Text>}>
          <Table<ChangeRequest> size="small" rowKey="id" dataSource={crs} pagination={false} scroll={{ x: 'max-content' }}
            onRow={(c) => ({ onClick: () => navigate(`/change/${c.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'CR', dataIndex: 'chgId' },
              { title: 'Title', dataIndex: 'title', ellipsis: true },
              { title: 'Type', dataIndex: 'type', render: (t) => <VwChip>{t}</VwChip> },
              { title: 'Risk', dataIndex: 'risk', render: (r: string) => <VwChip color={r === 'High' || r === 'Critical' ? 'red' : r === 'Medium' ? 'gold' : 'default'}>{r}</VwChip> },
              { title: 'Source', dataIndex: 'source', render: (s?: string) => s ?? 'Internal' },
              { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={crColor[s] ?? 'default'}>{s}</VwChip> },
            ]} />
        </VwCard>
      )}

      <BomDetailDrawer bom={bomDetail} open={!!bomDetail} onClose={() => setBomDetail(null)} />
    </Space>
  );
}
