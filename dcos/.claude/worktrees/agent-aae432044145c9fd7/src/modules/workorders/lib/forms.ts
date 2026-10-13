/** Camunda Forms registry — the JSON under src/workorders/forms, keyed by `zeebe:formDefinition formKey`. */
const FORM_RAW = import.meta.glob('/src/workorders/forms/*.form', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FORMS: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(FORM_RAW).map(([p, raw]) => [p.split('/').pop()!.replace(/\.form$/, ''), JSON.parse(raw) as Record<string, unknown>]),
);
export const FORM_KEYS = Object.keys(FORMS).sort();

/** Form schema for a form key; tolerates `camunda-forms:…:<key>` prefixes and falls back to the approve form. */
export function getFormSchema(formKey: string | undefined): Record<string, unknown> | undefined {
  if (!formKey) return FORMS['approve'];
  return FORMS[formKey] ?? FORMS[formKey.split(':').pop() ?? ''] ?? FORMS['approve'];
}
