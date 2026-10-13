import { Drawer, Descriptions, Empty, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { DownloadOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { downloadCsv } from '../../../shared/lib/csv';
import type { BOM, BOMLine, Project } from '../../../mock/data/types';
import { fmtDate } from '../../delivery/components/project/format';
import { VwChip } from '../../../shared/components/ux';
import { useMaterialData } from '../../delivery/lib/materialHooks';
import { stepLabel } from '../../delivery/components/project/materialView';

const { Text } = Typography;
const money = (v: number) => `$${v.toLocaleString()}`;

/** BOM detail with line items (each resolved to its catalogue item, project step and need-by date) and a real, detailed CSV export. */
export function BomDetailDrawer({ bom, open, onClose }: { bom: BOM | null; open: boolean; onClose: () => void }) {
  const lines = (useEntityList('bomLines', { filters: bom ? [{ field: 'bomId', operator: 'eq', value: bom.id }] : [], pageSize: 500 }).data?.data ?? []) as unknown as BOMLine[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const { materials } = useMaterialData();
  if (!bom) return null;
  const material = (id?: string) => (id ? materials.find((x) => x.id === id) : undefined);
  const stepOf = (l: BOMLine) => { if (!l.projectStepId) return undefined; const p = projects.find((x) => x.id === (l.projectId ?? bom.projectId)); return stepLabel(p?.template, l.projectStepId); };
  const project = projects.find((p) => p.id === bom.projectId);
  const sorted = [...lines].sort((a, b) => a.lineNo - b.lineNo);

  const exportCsv = () => {
    downloadCsv(
      `${bom.name.replace(/[^a-z0-9]+/gi, '_')}.csv`,
      ['Line', 'Part number', 'Description', 'Manufacturer', 'Category', 'Qty', 'Unit cost', 'Line total', 'Catalogue item', 'Project step', 'Need by'],
      sorted.map((l) => [l.lineNo, l.partNumber, l.description, l.manufacturer, l.category, l.quantity, l.unitCost, l.quantity * l.unitCost, material(l.materialId)?.matId ?? '', stepOf(l) ?? '', l.needBy?.slice(0, 10) ?? '']),
    );
  };

  return (
    <Drawer mask={false}
      open={open} onClose={onClose} width={960}
      title={<Space><Text strong>{bom.name}</Text><VwChip>{bom.type}</VwChip><VwChip>{bom.status}</VwChip></Space>}
      extra={<Button type="primary" icon={<DownloadOutlined />} disabled={!sorted.length} onClick={exportCsv}>Export CSV</Button>}
    >
      <Descriptions column={1} size="small" bordered style={{ marginBottom: "var(--vw-space-lg)" }}>
        <Descriptions.Item label="Project">{project?.name ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Lines">{sorted.length}</Descriptions.Item>
        <Descriptions.Item label="Total cost">{money(bom.totalCost)}</Descriptions.Item>
      </Descriptions>
      {sorted.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No line items" /> : (
        <Table<BOMLine>
          rowKey="id" size="small" pagination={false} dataSource={sorted} scroll={{ x: 'max-content' }}
          columns={[
            { title: '#', dataIndex: 'lineNo', width: 44 },
            { title: 'Part', dataIndex: 'partNumber', render: (p: string) => <Text>{p}</Text> },
            { title: 'Description', dataIndex: 'description' },
            { title: 'Mfr', dataIndex: 'manufacturer' },
            { title: 'Qty', dataIndex: 'quantity', align: 'right' },
            { title: 'Unit', dataIndex: 'unitCost', align: 'right', render: money },
            { title: 'Line total', key: 'tot', align: 'right', render: (_: unknown, l) => <Text strong>{money(l.quantity * l.unitCost)}</Text> },
            { title: 'Catalogue item', key: 'mat', render: (_: unknown, l) => { const x = material(l.materialId); return x ? <span title={`${x.kind} · supply chain ref ${x.scpRef}`}>{x.matId}</span> : <Text type="secondary">—</Text>; } },
            { title: 'Project step', key: 'step', render: (_: unknown, l) => stepOf(l) ?? <Text type="secondary">—</Text> },
            { title: 'Need by', dataIndex: 'needBy', render: (v?: string) => (v ? fmtDate(v) : <Text type="secondary">—</Text>) },
          ]}
          summary={(rows) => {
            const total = rows.reduce((s, r) => s + r.quantity * r.unitCost, 0);
            return <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={6}><Text strong>Total</Text></Table.Summary.Cell><Table.Summary.Cell index={6} align="right"><Text strong>{money(total)}</Text></Table.Summary.Cell><Table.Summary.Cell index={7} colSpan={3} /></Table.Summary.Row>;
          }}
        />
      )}
    </Drawer>
  );
}
export default BomDetailDrawer;
