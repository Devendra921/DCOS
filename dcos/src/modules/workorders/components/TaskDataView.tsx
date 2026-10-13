/** What a completed user task was completed with, labelled from its form: files, lists and choices read as text. */
import { Fragment, useMemo, type ReactNode } from 'react';
import { FileTextOutlined } from '../../../shared/icons';
import { getFormSchema } from '../lib/forms';
import { taskDataRows, type TaskDataValue } from '../lib/formData';

function Value({ value }: { value: TaskDataValue }) {
  if (value.kind === 'text') return <>{value.text}</>;
  if (value.kind === 'files') {
    return (
      <span className="vw-flex vw-flex-col">
        {value.files.map((f, i) => (
          <span key={i} title={f.type}><FileTextOutlined /> {f.name}{f.sizeKb ? <span className="vw-text-tertiary"> · {f.sizeKb.toLocaleString()} KB</span> : null}</span>
        ))}
      </span>
    );
  }
  return (
    <ol style={{ margin: 0, paddingLeft: 'var(--vw-space-md)' }}>
      {value.rows.map((cells, i) => (
        <li key={i}>{cells.map((c, j) => <Fragment key={j}>{j > 0 && <span className="vw-text-tertiary"> · </span>}{j === 0 ? c.text : <><span className="vw-text-tertiary">{c.label}</span> {c.text}</>}</Fragment>)}</li>
      ))}
    </ol>
  );
}

export function TaskDataView({ formKey, data, empty }: { formKey?: string; data?: Record<string, unknown>; empty?: ReactNode }) {
  const rows = useMemo(() => taskDataRows(getFormSchema(formKey), data), [formKey, data]);
  if (!rows.length) return <>{empty ?? <div className="vw-card-description">No form data was recorded for this step.</div>}</>;
  return (
    <dl className="wf-kv">
      {rows.map((r) => <Fragment key={r.key}><dt title={r.label}>{r.label}</dt><dd><Value value={r.value} /></dd></Fragment>)}
    </dl>
  );
}
