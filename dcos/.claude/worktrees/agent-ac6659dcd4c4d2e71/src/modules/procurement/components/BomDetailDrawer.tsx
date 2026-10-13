import { Drawer, Descriptions, Empty, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { DownloadOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { downloadCsv } from '../../../shared/lib/csv';
import type { BOM, BOMLine, Project } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const { Text } = Typography;
const money = (v: number) => `$${v.toLocaleString()}`;

/** BOM detail with line items and a real, detailed CSV export. */
export function BomDetailDrawer({ bom, open, onClose }: { bom: BOM | null; open: boolean; onClose: () => void }) {
  const lines = (useEntityList('bomLines', { filters: bom ? [{ field: 'bomId', operator: 'eq', value: bom.id }] : [], pageSize: 500 }).data?.data ?? []) as unknown as BOMLine[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  if (!bom) return null;
  const project = projects.find((p) => p.id === bom.projectId);
  const sorted = [...lines].sort((a, b) => a.lineNo - b.lineNo);

  const exportCsv = () => {
    downloadCsv(
      `${bom.name.replace(/[^a-z0-9]+/gi, '_')}.csv`,
      ['Line', 'Part number', 'Description', 'Manufacturer', 'Category', 'Qty', 'Unit cost', 'Line total'],
      sorted.map((l) => [l.lineNo, l.partNumber, l.description, l.manufacturer, l.category, l.quantity, l.unitCost, l.quantity * l.unitCost]),
    );
  };

  return (
    <Drawer mask={false}
      open={open} onClose={onClose} width={720}
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
          ]}
          summary={(rows) => {
            const total = rows.reduce((s, r) => s + r.quantity * r.unitCost, 0);
            return <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={6}><Text strong>Total</Text></Table.Summary.Cell><Table.Summary.Cell index={6} align="right"><Text strong>{money(total)}</Text></Table.Summary.Cell></Table.Summary.Row>;
          }}
        />
      )}
    </Drawer>
  );
}
export default BomDetailDrawer;
