/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import { Modal, Select, Typography } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ChangeRequest } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const { Paragraph } = Typography;

export interface ApprovedCR { id: string; ref: string; title: string; source?: string; label: string }

/** Approved change requests available to authorize a change (DCOS is the master of change requests). */
export function useApprovedCRs(): ApprovedCR[] {
  const data = useEntityList('changeRequests', { pageSize: 500 }).data?.data;
  return useMemo(() => ((data ?? []) as unknown as ChangeRequest[])
    .filter((c) => ['Approved', 'Scheduled', 'InProgress'].includes(c.status))
    .map((c) => {
      const ref = c.externalRef ?? c.chgId;
      return { id: c.id, ref, title: c.title, source: c.source, label: `${ref} — ${c.title}` };
    })
    .sort((a, b) => a.ref.localeCompare(b.ref)), [data]);
}

/** Embeddable dropdown of approved CRs (for use inside forms). */
export function ChangeRefSelect({ value, onChange, style }: { value?: string; onChange?: (id: string) => void; style?: React.CSSProperties }) {
  const opts = useApprovedCRs();
  return (
    <Select showSearch optionFilterProp="label" placeholder="Select the approved change request" style={{ width: '100%', ...style }}
      value={value} onChange={onChange} options={opts.map((o) => ({ value: o.id, label: o.label }))}
      notFoundContent="No approved change requests available" />
  );
}

/** Standalone gate for one-click actions: pick an approved CR, then confirm. Strictly required. */
export function ChangeRefModal({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: (cr: ApprovedCR) => void }) {
  if (!open) return null;
  return <ChangeRefDialog title={title} onCancel={onCancel} onConfirm={onConfirm} />;
}

function ChangeRefDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (cr: ApprovedCR) => void }) {
  const opts = useApprovedCRs();
  const [sel, setSel] = useState<string | undefined>();
  const chosen = opts.find((o) => o.id === sel);
  return (
    <Modal title={title} open onCancel={onCancel} okText="Authorize change" okButtonProps={{ disabled: !chosen }} onOk={() => chosen && onConfirm(chosen)}>
      <Paragraph type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>
        This change must be linked to an approved change request before it can proceed. The list shows the approved change requests in Changes.
      </Paragraph>
      <ChangeRefSelect value={sel} onChange={setSel} />
      {chosen && <div style={{ marginTop: 10 }}><VwChip color={chosen.source === 'ServiceNow' ? 'blue' : 'default'}>{chosen.source ?? 'DCOS'}</VwChip><VwChip>{chosen.ref}</VwChip></div>}
    </Modal>
  );
}
