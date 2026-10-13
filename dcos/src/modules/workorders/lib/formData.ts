/**
 * Task form data: turning form-js output into process variables, and reading them back for display.
 *
 *   • Files picked in a form (form-js `filepicker`) arrive as `files::<id>` keys plus a file map.
 *     They are stored the way Camunda 8 stores them: an array of document references
 *     (`camunda.document.type`, `documentId`, `metadata.fileName / contentType / size`). The
 *     prototype has no blob store, so only the reference and metadata are kept.
 *   • `taskDataRows` labels submitted data with the form's own labels and option texts, so a
 *     completed task reads as "Result: Pass", not `{"result":"pass"}`.
 */

import { OPEN_ITEM_ALIASES } from './engineCore';

const FILE_KEY = 'files::';

export interface DocumentReference {
  'camunda.document.type': 'camunda';
  storeId: string;
  documentId: string;
  metadata: { fileName: string; contentType: string; size: number; customProperties?: Record<string, unknown> };
}

let docSeq = 0;
const newDocumentId = () => `DOC-${Date.now().toString(36).toUpperCase()}-${(docSeq++).toString(36).toUpperCase()}`;

/** Replace every `files::…` value (also inside dynamic lists) with document references for its files. */
export function withDocumentReferences(data: Record<string, unknown>, files: Map<string, File[]>, uploadedBy?: string): Record<string, unknown> {
  const at = new Date().toISOString();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith(FILE_KEY)) {
      return (files.get(v) ?? []).map((f): DocumentReference => ({
        'camunda.document.type': 'camunda', storeId: 'in-memory', documentId: newDocumentId(),
        metadata: { fileName: f.name, contentType: f.type || 'application/octet-stream', size: f.size, customProperties: { uploadedAt: at, ...(uploadedBy ? { uploadedBy } : {}) } },
      }));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(data) as Record<string, unknown>;
}

export interface FileView { name: string; sizeKb?: number; type?: string }

/** Files held in a variable: Camunda document references, or the app's own `{ name, sizeKb }` attachments. */
export function filesOf(v: unknown): FileView[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out: FileView[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') return undefined;
    const r = x as Record<string, unknown>;
    const meta = r.metadata as Record<string, unknown> | undefined;
    if (r['camunda.document.type'] && meta) out.push({ name: String(meta.fileName ?? 'file'), sizeKb: typeof meta.size === 'number' ? Math.max(1, Math.round(meta.size / 1024)) : undefined, type: typeof meta.contentType === 'string' ? meta.contentType : undefined });
    else if (typeof r.name === 'string' && ('sizeKb' in r || 'mime' in r)) out.push({ name: r.name, sizeKb: typeof r.sizeKb === 'number' ? r.sizeKb : undefined, type: typeof r.mime === 'string' ? r.mime : undefined });
    else return undefined;
  }
  return out;
}

// ── Reading data back with the form's labels ─────────────────────────────────
interface FormComponent {
  id?: string; type: string; key?: string; path?: string; label?: string; dateLabel?: string;
  values?: { label: string; value: unknown }[]; components?: FormComponent[];
}

export type TaskDataValue =
  | { kind: 'text'; text: string }
  | { kind: 'files'; files: FileView[] }
  | { kind: 'list'; rows: { label: string; text: string }[][] };
export interface TaskDataRow { key: string; label: string; value: TaskDataValue }

const PRESENTATION = new Set(['text', 'html', 'image', 'separator', 'spacer', 'button', 'iframe', 'documentPreview', 'table']);

function optionText(c: FormComponent, v: unknown): string {
  const label = (x: unknown) => c.values?.find((o) => o.value === x)?.label ?? String(x);
  return Array.isArray(v) ? v.map(label).join(', ') : label(v);
}

/** Plain text for one value; undefined when there is nothing to show. */
function plain(c: FormComponent | undefined, v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (c?.values) return Array.isArray(v) && v.length === 0 ? undefined : optionText(c, v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'string') return v.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}).*$/, '$1 $2');
  const files = filesOf(v);
  if (files) return files.map((f) => f.name).join(', ');
  if (Array.isArray(v)) return v.length ? v.map((x) => plain(undefined, x) ?? '').filter(Boolean).join('; ') : undefined;
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${plain(undefined, x) ?? '—'}`).join(', ');
  return String(v);
}

/** A process variable as readable text (files by name, lists item by item, objects as key: value). */
export const describeValue = (v: unknown): string => plain(undefined, v) ?? '—';

const labelOf = (c: FormComponent) => (c.label ?? c.dateLabel ?? c.key ?? c.path ?? '').replace(/\s*\([^)]*\)\s*$/, '');

/** Fields of a form with their labels, flattening plain groups; dynamic lists stay one entry. */
function fieldsOf(components: FormComponent[] | undefined): FormComponent[] {
  const out: FormComponent[] = [];
  for (const c of components ?? []) {
    if (c.type === 'group' && !c.path) out.push(...fieldsOf(c.components));
    else if (c.key || c.path) out.push(c);
  }
  return out;
}

/**
 * Rows to show for submitted task data, in form order, labelled from the form schema. Computed
 * values (expression fields) and keys the form does not know are listed after the form's own
 * fields, by name, so nothing recorded is hidden.
 */
export function taskDataRows(schema: Record<string, unknown> | undefined, data: Record<string, unknown> | undefined): TaskDataRow[] {
  if (!data) return [];
  const rows: TaskDataRow[] = [];
  const seen = new Set<string>();
  const fields = fieldsOf((schema?.components ?? []) as FormComponent[]);
  const push = (key: string, label: string, c: FormComponent | undefined, v: unknown) => {
    seen.add(key);
    if (redundant(key, data)) return;
    const files = filesOf(v);
    if (files) { rows.push({ key, label, value: { kind: 'files', files } }); return; }
    if (c?.type === 'dynamiclist' && Array.isArray(v)) {
      const children = fieldsOf(c.components);
      const items = v.filter((x) => x && typeof x === 'object').map((x) => children
        .map((ch) => ({ ch, raw: (x as Record<string, unknown>)[ch.key ?? ''] }))
        .map(({ ch, raw }) => ({ label: labelOf(ch), text: filesOf(raw)?.map((f) => f.name).join(', ') ?? plain(ch, raw) ?? '' }))
        .filter((cell) => cell.text));
      if (items.length) rows.push({ key, label, value: { kind: 'list', rows: items } });
      return;
    }
    const text = plain(c, v);
    if (text !== undefined) rows.push({ key, label, value: { kind: 'text', text } });
  };
  for (const c of fields) {
    if (PRESENTATION.has(c.type) || c.type === 'expression') continue;
    const key = c.type === 'dynamiclist' ? c.path! : c.key!;
    if (key in data) push(key, labelOf(c), c, data[key]);
  }
  for (const c of fields) if (c.type === 'expression' && c.key && c.key in data) push(c.key, humanise(c.key), c, data[c.key]);
  for (const [k, v] of Object.entries(data)) if (!seen.has(k)) push(k, humanise(k), undefined, v);
  return rows;
}

/** Gateway copies of a value already shown (the open-items aliases, `approved` next to the decision). */
function redundant(key: string, data: Record<string, unknown>): boolean {
  if ((OPEN_ITEM_ALIASES as readonly string[]).includes(key)) return data[key] === data.openItems;
  if (key === 'blocked') return typeof data.openItems === 'number';
  if (key === 'approved') return typeof data.approvalDecision === 'string' || typeof data.goDecision === 'string';
  return false;
}

/** `failedTests` → "Failed tests". */
export function humanise(key: string): string {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
