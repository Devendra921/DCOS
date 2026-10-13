import { useState } from 'react';
import { Input, Upload, Alert, Space, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { UploadOutlined, ThunderboltOutlined } from '../../../shared/icons';
import { parseInventoryCsv, SAMPLE_INVENTORY_CSV, type RackImportRow, type HallDraft } from '../lib/commit';
import { VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const { TextArea } = Input;

export interface InventoryImportProps {
  value: RackImportRow[];
  onChange: (rows: RackImportRow[]) => void;
  halls: HallDraft[];
}

/** CSV paste/upload → parsed rack rows that populate the halls from step 2. */
export function InventoryImport({ value, onChange, halls }: InventoryImportProps) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function parse(raw: string) {
    setText(raw);
    if (!raw.trim()) { onChange([]); setErrors([]); return; }
    const { rows, errors } = parseInventoryCsv(raw);
    onChange(rows);
    setErrors(errors);
  }

  const hallNames = new Set(halls.map((h) => h.name.trim().toLowerCase()));
  const matched = value.filter((r) => hallNames.has((r.hall || '').trim().toLowerCase())).length;
  const unmatched = value.length - matched;

  return (
    <div>
      <Alert
        type="info"
        style={{ marginBottom: "var(--vw-space-md)" }}
        message="Paste or upload a rack inventory export"
        description={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Columns: hall, row, rack, purpose, heightU, usedU, maxPowerKw, currentPowerKw. Racks are placed into the halls defined on the floor plan, matched by hall name.</Text>}
      />
      <Space style={{ marginBottom: 10 }} wrap>
        <Upload
          accept=".csv,text/csv"
          showUploadList={false}
          beforeUpload={(f) => {
            const reader = new FileReader();
            reader.onload = () => parse(reader.result as string);
            reader.readAsText(f);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>Upload CSV</Button>
        </Upload>
        <Button icon={<ThunderboltOutlined />} onClick={() => parse(SAMPLE_INVENTORY_CSV)}>Load sample</Button>
        {value.length > 0 && <VwChip color="blue">{value.length} racks</VwChip>}
        {matched > 0 && <VwChip color="green">{matched} matched to halls</VwChip>}
        {unmatched > 0 && <VwChip color="orange">{unmatched} unmatched (will be skipped)</VwChip>}
      </Space>

      <TextArea
        value={text}
        onChange={(e) => parse(e.target.value)}
        placeholder={SAMPLE_INVENTORY_CSV}
        autoSize={{ minRows: 5, maxRows: 9 }}
        style={{ fontSize: "var(--vw-font-label-sm)" }}
      />

      {errors.length > 0 && (
        <Alert type="warning" style={{ marginTop: 10 }} message={errors.join(' · ')} />
      )}

      {value.length > 0 && (
        <Table
          size="small"
          style={{ marginTop: "var(--vw-space-md)" }}
          rowKey={(_, i) => String(i)}
          pagination={false}
          sticky={TABLE_STICKY}
          scroll={{ y: 320, x: 'max-content' }}
          dataSource={value}
          columns={[
            { title: 'Hall', dataIndex: 'hall', render: (v: string) => (hallNames.has((v || '').trim().toLowerCase()) ? v : <Text type="warning">{v || '—'}</Text>) },
            { title: 'Rack', dataIndex: 'name' },
            { title: 'Purpose', dataIndex: 'purpose', render: (v: string) => <VwChip>{v}</VwChip> },
            { title: 'U used', render: (_: unknown, r: RackImportRow) => `${r.usedU}/${r.heightU}` },
            { title: 'Power kW', render: (_: unknown, r: RackImportRow) => `${r.currentPowerKw}/${r.maxPowerKw}` },
          ]}
        />
      )}
    </div>
  );
}

export default InventoryImport;
