/** @bpmn-io/form-js viewer wrapper — loaded lazily by TaskForm. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App } from 'antd';
import { Form } from '@bpmn-io/form-js';
import '@bpmn-io/form-js/dist/assets/form-js.css';
import '../workorders.css';
import { VwButton } from '../../../shared/components/vw/VwButton';
import { withDocumentReferences } from '../lib/formData';

export interface TaskFormProps {
  schema?: Record<string, unknown>;
  data?: Record<string, unknown>;
  /** Changes re-import the form (use the task id). */
  formInstanceKey?: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void> | void;
  submitLabel?: string;
  /** Extra actions rendered left of the submit button (e.g. "Report implementation error"). */
  extra?: ReactNode;
  readOnly?: boolean;
}

export default function TaskFormInner({ schema, data, formInstanceKey, onSubmit, submitLabel = 'Complete task', extra, readOnly }: TaskFormProps) {
  const host = useRef<HTMLDivElement>(null);
  const form = useRef<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (!host.current) return;
    const f = new Form({ container: host.current, properties: { readOnly: !!readOnly } });
    form.current = f;
    return () => { f.destroy(); form.current = null; };
  }, [readOnly]);

  useEffect(() => {
    const f = form.current;
    if (!f || !schema) return;
    f.importSchema(schema as unknown as Parameters<Form['importSchema']>[0], data ?? {}).catch((err: unknown) => console.warn('[workorders] form import failed', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-import on task change only, not on every data identity change
  }, [schema, formInstanceKey, readOnly]);

  const submit = async () => {
    const f = form.current;
    if (!f) return;
    const { data: values, errors, files } = f.submit();
    if (errors && Object.keys(errors).length) { message.warning('Please fix the highlighted fields.'); return; }
    setBusy(true);
    // Picked files become document references (name, type, size) in the variables.
    try { await onSubmit(withDocumentReferences(values as Record<string, unknown>, files)); } finally { setBusy(false); }
  };

  return (
    <div className="wf-form vw-flex vw-flex-col vw-gap-sm">
      <div ref={host} />
      {!readOnly && (
        <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
          <div className="vw-flex vw-gap-sm vw-wrap">{extra}</div>
          <VwButton type="primary" loading={busy} onClick={submit}>{submitLabel}</VwButton>
        </div>
      )}
    </div>
  );
}
