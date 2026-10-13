import { useEffect } from 'react';
import { App, Modal, Form, Input, Select, InputNumber, Switch } from 'antd';
import { useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'switch';

export interface FieldSpec {
  name: string;
  label: string;
  type?: FieldType; // default 'text'
  required?: boolean;
  options?: { value: string | number; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  allowClear?: boolean;
  span?: number; // unused for now; reserved
}

export interface EntityFormModalProps<T extends Record<string, any>> {
  open: boolean;
  onClose: () => void;
  /** mock-db entity key, e.g. 'rirs' */
  entity: string;
  /** human label used in titles + audit, e.g. 'RIR' */
  label: string;
  /** id field name on the record, e.g. 'rirId'. id + this field both get the generated id on create. */
  idField: string;
  /** id prefix for new records, e.g. 'RIR' */
  idPrefix: string;
  fields: FieldSpec[];
  /** present → edit mode; absent → create mode */
  record?: T | null;
  initialValues?: Record<string, unknown>;
  /** derive/clean values before persisting (e.g. compute gateway from cidr) */
  transform?: (values: Record<string, unknown>, isEdit: boolean) => Record<string, unknown>;
  /** map a record → form values when opening in edit mode (e.g. ports[] → "443,8443") */
  toForm?: (record: T) => Record<string, unknown>;
  /** label field used in audit messages, default 'name' */
  nameField?: string;
}

export function EntityFormModal<T extends Record<string, any>>(props: EntityFormModalProps<T>) {
  const { open, onClose, entity, label, idField, idPrefix, fields, record, initialValues, transform, toForm, nameField = 'name' } = props;
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate(entity);
  const update = useEntityUpdate(entity);
  const audit = useRecordAudit();
  const isEdit = !!record;

  useEffect(() => {
    if (!open) return;
    if (record) form.setFieldsValue(toForm ? toForm(record) : record);
    else form.resetFields();
  }, [open, record, form, toForm]);

  const submit = async () => {
    const raw = await form.validateFields();
    const values = transform ? transform(raw, isEdit) : raw;
    if (isEdit && record) {
      const id = String((record as any).id);
      update.mutate({ id, data: { ...values, updatedAt: new Date().toISOString() } }, {
        onSuccess: () => {
          message.success(`${label} updated`);
          audit(label, id, 'updated', `Updated ${String((record as any)[nameField] ?? id)}`);
          onClose();
        },
      });
    } else {
      const id = `${idPrefix}-NEW-${Date.now().toString().slice(-5)}`;
      const now = new Date().toISOString();
      create.mutate({
        id, [idField]: id, ...values,
        isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
      }, {
        onSuccess: () => {
          message.success(`${label} created`);
          audit(label, id, 'created', `Created ${String(values[nameField] ?? id)}`);
          onClose();
        },
      });
    }
  };

  return (
    <Modal title={isEdit ? `Edit ${label}` : `New ${label}`} open={open} onOk={submit} onCancel={onClose} okText={isEdit ? 'Save' : 'Create'} destroyOnClose width={fields.length > 4 ? 720 : 520}>
      <Form className="vw-form-grid" form={form} layout="vertical" initialValues={initialValues}>
        {fields.map((f) => {
          const rules = f.required ? [{ required: true, message: `${f.label} is required` }] : undefined;
          const fieldLabel = f.label.replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase());
          const placeholder = f.placeholder?.trim() || `${f.type === 'select' || f.type === 'multiselect' ? 'Select' : 'Enter'} ${fieldLabel}`;
          let control: React.ReactNode;
          switch (f.type) {
            case 'textarea': control = <Input.TextArea rows={2} placeholder={placeholder} />; break;
            case 'number': control = <InputNumber min={f.min} max={f.max} style={{ width: '100%' }} placeholder={placeholder} />; break;
            case 'select': control = <Select allowClear={f.allowClear} showSearch optionFilterProp="label" options={f.options} placeholder={placeholder} />; break;
            case 'multiselect': control = <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={f.options} placeholder={placeholder} />; break;
            case 'switch': control = <Switch />; break;
            default: control = <Input placeholder={placeholder} />;
          }
          return (
            <Form.Item className={f.type === 'textarea' || f.type === 'multiselect' || f.span === 24 ? 'is-full' : undefined} key={f.name} name={f.name} label={f.label} rules={rules} valuePropName={f.type === 'switch' ? 'checked' : undefined}>
              {control}
            </Form.Item>
          );
        })}
      </Form>
    </Modal>
  );
}

export default EntityFormModal;
