import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import type { Tone } from '../../../ops/lib/tone';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { useLookup } from '../lib/useLookup';
import type { Subnet } from '../../../mock/data/types';

interface TreeNode extends Subnet { children?: TreeNode[]; depth: number }

const statusTone: Record<string, Tone> = { Container: 'purple', Active: 'success', Reserved: 'warning', Deprecated: 'neutral' };

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

  // Expand / collapse: only the children of expanded prefixes are listed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const visible = useMemo(() => {
    const out: TreeNode[] = [];
    const add = (n: TreeNode) => { out.push(n); if (n.children && expanded.has(n.id)) n.children.forEach(add); };
    tree.forEach(add);
    return out;
  }, [tree, expanded]);

  const columns: Col<TreeNode>[] = [
    { key: 'cidr', header: 'Prefix', render: (r) => (
      <span className="row" style={{ gap: 4, paddingLeft: r.depth * 20, flexWrap: 'nowrap' }}>
        {r.children ? (
          <button type="button" className="nst-icon-btn" style={{ width: 22, height: 22 }} aria-expanded={expanded.has(r.id)}
            aria-label={expanded.has(r.id) ? `Collapse ${r.cidr}` : `Expand ${r.cidr}`}
            onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>
            {expanded.has(r.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span style={{ width: 22, flex: 'none' }} />}
        <span className="cell-2">
          <span className={`mono${r.status === 'Container' ? ' strong' : ''}`}>{r.cidr}</span>
          {r.children && <small>{r.children.length} child prefix{r.children.length === 1 ? '' : 'es'}</small>}
        </span>
      </span>
    ) },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'status', header: 'Status', render: (r) => (r.status ? <Chip tone={statusTone[r.status] ?? 'neutral'} dot>{r.status}</Chip> : <span className="muted">—</span>) },
    { key: 'role', header: 'Role', render: (r) => (r.roleId ? role[r.roleId] ?? '—' : '—') },
    { key: 'vrf', header: 'VRF', render: (r) => (r.vrfId ? vrf[r.vrfId] ?? '—' : 'Global') },
    { key: 'util', header: 'Utilization', render: (r) => (
      <span className="cell-2">
        <Meter pct={r.utilizationPct} width={96} />
        <small>{r.usedHosts}/{r.totalHosts} hosts</small>
      </span>
    ) },
  ];

  return (
    <div className="ops-root">
      <Panel title="Prefix hierarchy" sub="Containers roll up their child prefixes · expand to drill down, click a row to open it" icon={Network} count={tree.length} flush>
        <DataTable<TreeNode>
          rows={visible}
          cols={columns}
          pageSize={Math.max(25, visible.length)}
          onRow={(r) => navigate(`/ipam/subnets/${r.id}`)}
          empty={isLoading ? <Empty icon={Network} title="Loading prefixes…" /> : <Empty icon={Network} title="No prefixes">No prefixes in this scope yet.</Empty>}
        />
      </Panel>
    </div>
  );
}
