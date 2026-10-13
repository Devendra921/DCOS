import { useEffect, useState } from 'react';
import { App, Checkbox, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { VwButton as Button } from '../components/vw/VwButton';

import { EditOutlined } from '../icons';
import dayjs from 'dayjs';
import { useEntityUpdate } from '../hooks/useEntityCRUD';
import { useRecordAudit } from '../hooks/useAudit';
import { useCustomFields } from './useCustomization';
import { TagChips } from './TagChips';
import { TagSelect } from './TagSelect';
import type { CustomField } from '../../mock/data/types';
import { VwCard } from '../components/ux';

const { Text, Link } = Typography;

function renderValue(f: CustomField, v: unknown) {
  if (v === undefined || v === null || v === '') return <span className="vw-text-tertiary">—</span>;
  switch (f.type) {
    case 'boolean': return v ? 'Yes' : 'No';
    case 'url': return <Link href={String(v)} target="_blank">{String(v)}</Link>;
    case 'multiselect': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'date': return String(v).slice(0, 10);
    default: return String(v);
  }
}

/**
 * Drop-in card showing a record's Tags + Custom fields, with an edit modal.
 * Reusable across any entity: <EntityCustomizeCard entityType="devices" record={device} />
 */
export function EntityCustomizeCard<T extends { id: string; tags?: string[]; customFields?: Record<string, unknown> }>(
  { entityType, record, label = 'Tags & custom fields' }: { entityType: string; record: T; label?: string },
) {
  const { message } = App.useApp();
  const fields = useCustomFields(entityType);
  const update = useEntityUpdate(entityType);
  const audit = useRecordAudit();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    const cf = record.customFields ?? {};
    form.setFieldsValue({
      tags: record.tags ?? [],
      ...Object.fromEntries(fields.map((f) => [f.key, f.type === 'date' && cf[f.key] ? dayjs(cf[f.key] as string) : cf[f.key]])),
    });
  }, [open, record, fields, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const { tags, ...rest } = v;
    const customFields: Record<string, unknown> = { ...(record.customFields ?? {}) };
    for (const f of fields) {
      let val = rest[f.key];
      if (f.type === 'date' && val) val = (val as dayjs.Dayjs).toISOString();
      customFields[f.key] = val;
    }
    update.mutate({ id: record.id, data: { tags, customFields, updatedAt: new Date().toISOString() } }, {
      onSuccess: () => { audit(entityType, record.id, 'updated', 'Updated tags & custom fields'); message.success('Saved'); setOpen(false); },
    });
  };

  return (
    <VwCard size="small" title={label} extra={<Button size="small" icon={<EditOutlined />} onClick={() => setOpen(true)}>Edit</Button>}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Tags"><TagChips ids={record.tags} /></Descriptions.Item>
        {fields.map((f) => (
          <Descriptions.Item key={f.key} label={f.label}>{renderValue(f, record.customFields?.[f.key])}</Descriptions.Item>
        ))}
        {fields.length === 0 && <Descriptions.Item label="Custom fields"><span className="vw-text-tertiary">None defined for this object type</span></Descriptions.Item>}
      </Descriptions>

      <Modal title={label} open={open} onOk={submit} onCancel={() => setOpen(false)} okText="Save" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="tags" label="Tags"><TagSelect style={{ width: '100%' }} /></Form.Item>
          {fields.map((f) => {
            const rules = f.required ? [{ required: true, message: `${f.label} is required` }] : undefined;
            let control: React.ReactNode;
            switch (f.type) {
              case 'longtext': control = <Input.TextArea placeholder={`Enter ${f.label}`} rows={2} />; break;
              case 'number': control = <InputNumber placeholder={`Enter ${f.label}`} style={{ width: '100%' }} />; break;
              case 'boolean': control = <Checkbox />; break;
              case 'date': control = <DatePicker placeholder={`Select date for ${f.label}`} style={{ width: '100%' }} />; break;
              case 'select': control = <Select placeholder={`Select ${f.label}`} allowClear options={(f.choices ?? []).map((c) => ({ value: c, label: c }))} />; break;
              case 'multiselect': control = <Select placeholder={`Select ${f.label}`} mode="multiple" allowClear options={(f.choices ?? []).map((c) => ({ value: c, label: c }))} />; break;
              case 'url': control = <Input placeholder="https://…" />; break;
              default: control = <Input placeholder={`Enter ${f.label}`} />;
            }
            return (
              <Form.Item key={f.key} name={f.key} label={<Space size={4}>{f.label}{f.description && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>({f.description})</Text>}</Space>} rules={rules} valuePropName={f.type === 'boolean' ? 'checked' : undefined}>
                {control}
              </Form.Item>
            );
          })}
        </Form>
      </Modal>
    </VwCard>
  );
}
export default EntityCustomizeCard;
