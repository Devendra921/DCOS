import { useMemo, useState } from 'react';
import { Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import type { TableColumnType } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { PreviewPage } from '../../futurestate/components/PreviewScaffold';
import type { PolicyDecision } from '../../../mock/data/types';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const decColor: Record<string, string> = { allow: 'green', deny: 'red', warn: 'orange' };

export default function DecisionRecordsPage() {
  const all = (useEntityList('policyDecisions', { pageSize: 1000 }).data?.data ?? []) as unknown as PolicyDecision[];
  const [filter, setFilter] = useState<string>('All');
  const rows = useMemo(() => {
    const sorted = [...all].sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1));
    return filter === 'All' ? sorted : sorted.filter((d) => d.decision === filter.toLowerCase());
  }, [all, filter]);

  const cols: TableColumnType<PolicyDecision>[] = [
    { title: 'Evaluated', dataIndex: 'evaluatedAt', render: (t: string) => t.slice(0, 16).replace('T', ' '), width: 140 },
    { title: 'Policy', dataIndex: 'policyName' },
    { title: 'Resource', dataIndex: 'resourceName', render: (n: string, r) => <span>{n} <VwChip>{r.resourceType}</VwChip></span> },
    { title: 'Decision', dataIndex: 'decision', render: (d: string) => <VwChip color={decColor[d]}>{d.toUpperCase()}</VwChip> },
    { title: 'By', dataIndex: 'evaluatedBy', render: (b: string) => <VwChip color="purple">{b}</VwChip>, width: 80 },
  ];

  return (
    <PreviewPage
      title="OPA Decision Records"
      subtitle="Immutable log of every policy evaluation — the input sent to OPA, the policy applied, and the allow/deny/warn result."
      contract={{
        sources: ['OPA policy engine (decision logs)'],
        cadence: 'Per evaluation (change-time + scheduled re-scan)',
        fields: [
          { name: 'input', desc: 'the JSON document sent to OPA (the resource being evaluated)' },
          { name: 'result.decision', desc: 'allow / deny / warn from the policy' },
          { name: 'result.violation[]', desc: 'human-readable violation messages from the policy' },
          { name: 'policyId / package', desc: 'which policy + package produced the decision' },
          { name: 'evaluatedAt / decisionId', desc: 'OPA decision-log id + timestamp for the audit trail' },
        ],
        notes: [
          'Wire OPA decision logging (decision_logs) to stream every evaluation here; records must be immutable + attributable.',
          'The rows below are simulated against real seed entities to show the shape; live decisions come from your OPA service.',
        ],
      }}
    >
      <VwSegmented style={{ marginBottom: "var(--vw-space-md)" }} value={filter} onChange={(v) => setFilter(v as string)} options={['All', 'Allow', 'Deny', 'Warn']} />
      <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
        Showing {rows.length} decisions
      </div>
      <VwCard bodyStyle={{ padding: 0 }}>
        <Table<PolicyDecision>
          rowKey="id"
          size="small"
          dataSource={rows}
          columns={cols}
          pagination={false} sticky={TABLE_STICKY}
          scroll={{ x: 'max-content', y: 420 }}
          expandable={{
            expandedRowRender: (r) => (
              <div>
                <Text strong style={{ fontSize: "var(--vw-font-label-sm)" }}>OPA input</Text>
                <pre style={{ fontFamily: 'inherit', background: "var(--vw-color-slate-900)", color: "var(--vw-color-slate-200)", padding: "var(--vw-space-md)", borderRadius: 6, fontSize: "var(--vw-font-label-sm)", marginTop: "var(--vw-space-xxs)" }}>{JSON.stringify(JSON.parse(r.input), null, 2)}</pre>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{r.message}</Text>
              </div>
            ),
          }}
        />
      </VwCard>
    </PreviewPage>
  );
}
