import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer, Space, Typography } from 'antd';
import type { BOM, Material, Project, PurchaseOrder, PurchaseOrderLine, Vendor } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useMaterialData } from '../../delivery/lib/materialHooks';
import { linesOfPoLine, poLinesOfPo, receiptsOfPo } from '../../delivery/lib/materialRules';
import { DataTable, KvList, Muted } from '../../delivery/components/project/kit';
import { fmtDate, money } from '../../delivery/components/project/format';
import { SupplierDate } from '../../delivery/components/project/materials';
import { PO_LINE_TONE, isLatePoLine, receiptSummary, stepLabel } from '../../delivery/components/project/materialView';

const { Text } = Typography;

/** Purchase order detail: the order, and its lines and goods receipts as mirrored read-only from the ERP. */
export function PoDetailDrawer({ po, open, onClose }: { po: PurchaseOrder | null; open: boolean; onClose: () => void }) {
  const m = useMaterialData();
  const vendors = (useEntityList('vendors', { pageSize: 500 }).data?.data ?? []) as unknown as Vendor[];
  const boms = (useEntityList('boms', { pageSize: 1000 }).data?.data ?? []) as unknown as BOM[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const [now] = useState(() => Date.now());
  const mats = useMemo(() => new Map(m.materials.map((x) => [x.id, x] as [string, Material])), [m.materials]);
  if (!po) return null;
  const lines = poLinesOfPo(m, po.id);
  const receipts = receiptsOfPo(m, po.id);
  const bom = boms.find((b) => b.id === po.bomId);
  const project = projects.find((p) => p.id === bom?.projectId);
  const projectOfLine = (l: PurchaseOrderLine) => { const ml = linesOfPoLine(m, l.id)[0]; return ml ? { p: projects.find((x) => x.id === ml.projectId), step: ml.projectStepId } : undefined; };
  const late = lines.filter((l) => isLatePoLine(l, now)).length;

  return (
    <Drawer mask={false} open={open} onClose={onClose} width={860}
      title={<Space><Text strong>{po.poId}</Text><VwChip>{po.status}</VwChip></Space>}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <KvList columns={2} items={[
          { label: 'Vendor', value: vendors.find((v) => v.id === po.vendorId)?.name ?? '—' },
          { label: 'Bill of materials', value: bom?.name ?? '—' },
          { label: 'Project', value: project ? <Link to={`/delivery/projects/${project.id}?tab=procurement`}>{project.name}</Link> : '—' },
          { label: 'Order by', value: fmtDate(po.orderBy) },
          { label: 'Need by', value: fmtDate(po.needBy) },
          { label: 'Planned cost', value: money(po.plannedCost) },
          { label: 'Paid', value: money(po.actualSpend) },
          { label: 'Lines late', value: late ? <span style={{ color: 'var(--vw-color-red-600)' }}>{late} of {lines.length}</span> : `none of ${lines.length}` },
        ]} />

        <VwCard variant="child" title="Order lines" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>read-only</Muted><VwChip variant="neutral">From ERP</VwChip></span>}>
          <DataTable rows={lines} rowKey={(l) => l.id} empty={m.ready ? 'The ERP has sent no lines for this order.' : 'Loading…'}
            cols={[
              { key: 'n', title: 'Line', align: 'right', width: 48, render: (l) => l.lineNo },
              { key: 'i', title: 'Item', wrap: true, render: (l) => { const x = mats.get(l.materialId); return x ? <div>{x.description}<div><Muted size="xs">{x.partNumber} · {x.manufacturer}</Muted></div></div> : <Muted>{l.materialId}</Muted>; } },
              { key: 'q', title: 'Ordered', align: 'right', render: (l) => l.quantity },
              { key: 'r', title: 'Received', align: 'right', render: (l) => l.receivedQty },
              { key: 'st', title: 'Status', render: (l) => <VwChip variant={PO_LINE_TONE[l.status]}>{l.status}</VwChip> },
              { key: 'nb', title: 'Need by', render: (l) => fmtDate(l.needBy) },
              { key: 'eta', title: 'Supplier date', render: (l) => <SupplierDate eta={l.eta} late={isLatePoLine(l, now)} /> },
              { key: 'for', title: 'For', wrap: true, render: (l) => { const f = projectOfLine(l); return f?.p ? <span>{f.p.projId} <Muted size="xs">{stepLabel(f.p.template, f.step ?? '')}</Muted></span> : <Muted>—</Muted>; } },
              { key: 'ref', title: 'ERP ref', render: (l) => <Muted>{l.erpRef}</Muted> },
            ]} />
        </VwCard>

        <VwCard variant="child" title="Goods receipts" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>read-only</Muted><VwChip variant="neutral">From ERP</VwChip></span>}>
          <DataTable rows={receipts} rowKey={(g) => g.id} empty="Nothing received against this order yet."
            cols={[
              { key: 'id', title: 'Receipt', render: (g) => g.grId },
              { key: 'at', title: 'Received', render: (g) => fmtDate(g.receivedAt) },
              { key: 'w', title: 'What', wrap: true, render: (g) => receiptSummary(g) },
              { key: 'ref', title: 'ERP ref', render: (g) => <Muted>{g.erpRef}</Muted> },
            ]} />
        </VwCard>
      </div>
    </Drawer>
  );
}
export default PoDetailDrawer;
