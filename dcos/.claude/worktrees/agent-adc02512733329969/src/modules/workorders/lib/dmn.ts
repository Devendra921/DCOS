/**
 * DMN decision tables — the XML (rendered read-only by dmn-js on the Rules page) plus the
 * JavaScript mirror of each table, which lives in dmnTables.ts (pure, so scripts and libraries
 * can import it without the bundler). Rule ids match the `<rule id>` in the XML.
 */
export * from './dmnTables';

const DMN_RAW = import.meta.glob('/src/workorders/dmn/*.dmn', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const DMN_XML: Record<string, string> = Object.fromEntries(Object.entries(DMN_RAW).map(([p, xml]) => [p.split('/').pop()!.replace(/\.dmn$/, ''), xml]));
