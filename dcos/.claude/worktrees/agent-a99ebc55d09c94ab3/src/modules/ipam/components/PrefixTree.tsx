import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Progress, Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { TableColumnType } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useLookup } from '../lib/useLookup';
import { VwCard, VwChip } from '../../../shared/components/ux';
import type { Subnet } from '../../../mock/data/types';

const { Text } = Typography;

interface TreeNode extends Subnet { children?: TreeNode[]; depth: number }

const statusColor: Record<string, string> = { Container: 'purple', Active: 'green', Reserved: 'gold', Deprecated: 'default' };

/**
 * Hierarchical prefix view: Container prefixes expand into their child prefixes
 * (via parentId). Containers roll up child utilization so an operator can drill
 * a supernet → container → leaf without leaving the table.
 */
export default function PrefixTree() {
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const role = useLookup('ipamRoles');
  const vrf = useLookup('vrfs');
  const { data, isLoading } = useEntityList('subnets', { pageSize: 1000, filters: dcF });

  const tree = useMemo<TreeNode[]>(() => {
    const rows = (data?.data ?? []) as unknown as Subnet[];
    const byId = new Map<string, TreeNode>();
    rows.forEach((r) => byId.set(r.id, { ...r, depth: 0, children: [] }));
    const roots: TreeNode[] = [];
    byId.forEach((node) => {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children!.push(node);
      else roots.push(node);
    });
    // assign depth + roll up container utilization from children
    const walk = (node: TreeNode, depth: number) => {
      node.depth = depth;
      (node.children ?? []).forEach((c) => walk(c, depth + 1));
      if (node.status === 'Container' && node.children && node.children.length) {
        const used = node.children.reduce((s, c) => s + (c.usedHosts ?? 0), 0);
        const total = node.children.reduce((s, c) => s + (c.totalHosts ?? 0), 0);
        node.usedHosts = used;
        node.totalHosts = total;
        node.utilizationPct = total ? Math.round((used / total) * 100) : node.utilizationPct;
      }
      if (!node.children?.length) delete node.children;
    };
    roots.forEach((r) => walk(r, 0));
    // Containers first, then by CIDR
    roots.sort((a, b) => (a.status === 'Container' ? -1 : 1) - (b.status === 'Container' ? -1 : 1) || a.cidr.localeCompare(b.cidr));
    return roots;
  }, [data]);

  const columns: TableColumnType<TreeNode>[] = [
    { title: 'Prefix', dataIndex: 'cidr', render: (c: string, r) => <Text strong={r.status === 'Container'}>{c}</Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Status', dataIndex: 'status', render: (s: string) => <VwChip color={statusColor[s] ?? 'default'}>{s}</VwChip> },
    { title: 'Role', dataIndex: 'roleId', render: (id?: string) => (id ? role[id] ?? '—' : '—') },
    { title: 'VRF', dataIndex: 'vrfId', render: (id?: string) => (id ? vrf[id] ?? '—' : 'Global') },
    { title: 'Hosts', key: 'hosts', render: (_: unknown, r) => `${r.usedHosts}/${r.totalHosts}` },
    { title: 'Utilization', dataIndex: 'utilizationPct', width: 180, render: (v: number) => <Progress percent={v} size="small" status={v >= 85 ? 'exception' : 'normal'} /> },
  ];

  return (
    <VwCard bodyStyle={{ padding: 0 }}>
      <Table<TreeNode>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={tree}
        pagination={false}
        size="middle"
        scroll={{ x: 'max-content' }}
        expandable={{ defaultExpandAllRows: false, childrenColumnName: 'children' }}
        onRow={(r) => ({ onClick: () => navigate(`/ipam/subnets/${r.id}`), style: { cursor: 'pointer' } })}
      />
    </VwCard>
  );
}
