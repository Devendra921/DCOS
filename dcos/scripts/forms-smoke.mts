/* Smoke test for the Camunda forms under src/workorders/forms against the process model.
   Run: npx tsx scripts/forms-smoke.mts   (exits non-zero when a check fails)

   • every form is valid JSON with unique component ids and unique keys per scope, uses only
     component types form-js 2.1 renders, and every FEEL expression parses;
   • every formKey in the model has a form, and every form is used;
   • every variable a gateway reads after a user task can be set by that task's form (directly,
     through an expression field, or through the engine's open-items / decision mapping) or is
     set by code (DMN result, start variable);
   • the expression fields compute what the gateways expect: scenarios fill a form, compute its
     expressions with the FEEL engine form-js uses, and check which branch the gateway takes;
   • record-backed tasks (completeOn: 'record') say what to do, and the record's actions drive them. */
import { readFileSync, readdirSync } from 'node:fs';
import { evaluate, parseExpression } from '@bpmn-io/feelin';
import { PROCESSES, PROCESS_BY_KEY, evalCondition, nodeById, outgoing, type WfProcess } from '../src/workorders/model.ts';
import { normaliseVariables, OPEN_ITEM_ALIASES } from '../src/modules/workorders/lib/engineCore.ts';
import { taskDataRows, withDocumentReferences } from '../src/modules/workorders/lib/formData.ts';

let failures = 0; let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const section = (name: string, fn: () => void) => { console.log(`\n# ${name}`); const before = failures; try { fn(); } catch (e) { failures++; console.log(`  FAIL threw: ${e instanceof Error ? e.stack : String(e)}`); } console.log(failures === before ? '  ok' : `  ${failures - before} failure(s)`); };

interface Comp { id?: string; type: string; key?: string; path?: string; label?: string; expression?: string; defaultValue?: unknown; validate?: { required?: boolean }; conditional?: { hide?: string }; layout?: { row?: string; columns?: number }; components?: Comp[] }
interface FormJson { id: string; type: string; schemaVersion: number; components: Comp[] }

const DIR = 'src/workorders/forms';
const FORMS: Record<string, FormJson> = {};
const RAW: Record<string, string> = {};
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.form'))) RAW[f.replace(/\.form$/, '')] = readFileSync(`${DIR}/${f}`, 'utf8');

/** Component types rendered by @bpmn-io/form-js-viewer 2.1 (checked against its bundle below). */
const SUPPORTED = ['text', 'textfield', 'textarea', 'number', 'checkbox', 'checklist', 'radio', 'select', 'taglist', 'datetime', 'filepicker', 'dynamiclist', 'group', 'expression', 'separator', 'spacer', 'html', 'image', 'table', 'iframe', 'button', 'documentPreview'];
const KEYED = new Set(['textfield', 'textarea', 'number', 'checkbox', 'checklist', 'radio', 'select', 'taglist', 'datetime', 'filepicker', 'expression']);
const walk = (cs: Comp[] | undefined, fn: (c: Comp) => void) => { for (const c of cs ?? []) { fn(c); walk(c.components, fn); } };
/** Variables a form submits at the top level (keys outside dynamic lists, plus each list's path). */
function topKeys(cs: Comp[] | undefined): string[] {
  const out: string[] = [];
  for (const c of cs ?? []) {
    if (c.type === 'dynamiclist' && c.path) out.push(c.path);
    else if (c.type === 'group' && !c.path) out.push(...topKeys(c.components));
    else if (c.key) out.push(c.key);
  }
  return out;
}
const feel = (e: string) => e.replace(/^=/, '');

section('Form files: valid JSON, unique ids and keys, supported components, FEEL parses', () => {
  const viewer = readFileSync('node_modules/@bpmn-io/form-js-viewer/dist/index.es.js', 'utf8');
  for (const t of SUPPORTED) ok(viewer.includes(`'${t}'`), `form-js-viewer renders "${t}"`);
  for (const [name, raw] of Object.entries(RAW)) {
    let form: FormJson | undefined;
    try { form = JSON.parse(raw) as FormJson; } catch (e) { ok(false, `${name}: valid JSON (${(e as Error).message})`); continue; }
    FORMS[name] = form;
    ok(form.id === name, `${name}: form id matches the file name`);
    ok(form.type === 'default' && typeof form.schemaVersion === 'number' && Array.isArray(form.components), `${name}: form header`);
    const ids = new Set<string>();
    walk(form.components, (c) => {
      ok(c.id && !ids.has(c.id), `${name}: component id ${c.id} is unique`); if (c.id) ids.add(c.id);
      ok(SUPPORTED.includes(c.type), `${name}: ${c.id} type "${c.type}" is supported`);
      if (KEYED.has(c.type)) ok(!!c.key, `${name}: ${c.id} has a key`);
      if (c.type === 'dynamiclist') ok(!!c.path && (c.components ?? []).length > 0, `${name}: ${c.id} has a path and fields`);
      for (const e of [c.expression, c.conditional?.hide].filter((x): x is string => !!x)) {
        let parsed = true; try { parseExpression(feel(e)); } catch { parsed = false; }
        ok(e.startsWith('=') && parsed, `${name}: ${c.id} FEEL "${e}" parses`);
      }
    });
    // keys unique per scope (top level, and inside each dynamic list)
    const scopes: Comp[][] = [form.components]; walk(form.components, (c) => { if (c.type === 'dynamiclist') scopes.push(c.components ?? []); });
    for (const scope of scopes) { const keys = topKeys(scope); ok(new Set(keys).size === keys.length, `${name}: keys unique in scope (${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')})`); }
    // a 16-column grid: a row never holds more than 16 columns
    const rows = new Map<string, number>(); walk(form.components, (c) => { if (c.layout?.row) rows.set(c.layout.row, (rows.get(c.layout.row) ?? 0) + (c.layout.columns ?? 16)); });
    for (const [row, cols] of rows) ok(cols <= 16, `${name}: row ${row} fits the 16-column grid (${cols})`);
    // decisions are never pre-selected (an approval cannot be given by accident)
    walk(form.components, (c) => { if (['approvalDecision', 'goDecision', 'decision'].includes(c.key ?? '') || (c.key === 'approved' && c.type === 'checkbox')) ok(c.defaultValue === undefined, `${name}: ${c.key} has no default`); });
  }
});

// ── Model ↔ forms ─────────────────────────────────────────────────────────────
const userTasks = PROCESSES.flatMap((p) => p.nodes.filter((n) => n.type === 'userTask').map((n) => ({ p, n })));

section('Every formKey in the model has a form, every form is used', () => {
  for (const { p, n } of userTasks) ok(n.formKey && FORMS[n.formKey], `${p.pid} ${n.id}: form "${n.formKey}" exists`);
  const used = new Set(userTasks.map((t) => t.n.formKey));
  for (const name of Object.keys(FORMS)) ok(used.has(name), `form ${name} is used by at least one task`);
});

/** Gateways reached from a node before the next user task or wait, with the variables their conditions read. */
function downstreamGateways(p: WfProcess, from: string): { id: string; vars: string[] }[] {
  const out: { id: string; vars: string[] }[] = []; const seen = new Set<string>(); const q = outgoing(p, from).map((f) => f[1]);
  while (q.length) {
    const id = q.shift()!; if (seen.has(id)) continue; seen.add(id);
    const m = nodeById(p, id); if (!m || m.type === 'userTask' || m.type === 'messageCatch') continue;
    if (m.type === 'exclusiveGateway') out.push({ id, vars: [...new Set(outgoing(p, id).flatMap((f) => [...(f[3] ?? '').matchAll(/([A-Za-z_]\w*)\s*(?:!=|>=|<=|=|>|<)/g)].map((x) => x[1])))] });
    q.push(...outgoing(p, id).map((f) => f[1]));
  }
  return out;
}
/** Variables set by code rather than by the task before the gateway. */
const CODE_SET: Record<string, string> = { hasMaterials: 'P10 start variable (the work order has material lines)', severity: 'incident record / incident-severity DMN', blocked: 'the Blocking checks service task (dcos.blocking-checks) before the gateway' };

section('Gateway variables after each user task can be set by its form or by code', () => {
  for (const { p, n } of userTasks) {
    const form = FORMS[n.formKey ?? '']; if (!form) continue;
    const keys = new Set(topKeys(form.components));
    if (keys.has('openItems') || keys.has('openItemsList')) { for (const k of OPEN_ITEM_ALIASES) keys.add(k); keys.add('blocked'); }
    if (keys.has('approvalDecision')) keys.add('approved');
    for (const g of downstreamGateways(p, n.id)) for (const v of g.vars) ok(keys.has(v) || CODE_SET[v], `${p.pid} ${n.id} (${n.formKey}) → ${g.id} reads "${v}"`);
  }
});

// ── Scenarios: fill a form, compute its expressions, follow the gateway ──────
/** Compute a form's expression fields over `data` the way form-js does (re-run until stable). */
function computed(formKey: string, data: Record<string, unknown>): Record<string, unknown> {
  const exprs: Comp[] = []; walk(FORMS[formKey].components, (c) => { if (c.type === 'expression') exprs.push(c); });
  const out = { ...data };
  for (let i = 0; i < 3; i++) for (const c of exprs) out[c.key!] = evaluate(feel(c.expression!), out).value;
  return out;
}
const hidden = (formKey: string, id: string, data: Record<string, unknown>) => { let h: unknown; walk(FORMS[formKey].components, (c) => { if (c.id === id && c.conditional?.hide) h = evaluate(feel(c.conditional.hide), data).value; }); return h === true; };
/** Where the token goes after completing `taskId` with `data`: the node the gateway after the task sends it to. */
function route(pid: string, taskId: string, data: Record<string, unknown>, before: Record<string, unknown> = {}): { to: string; vars: Record<string, unknown> } {
  const p = PROCESSES.find((x) => x.pid === pid)!;
  const n = nodeById(p, taskId)!;
  const submitted = computed(n.formKey!, data);
  const vars = normaliseVariables({ ...before, ...submitted }, submitted);
  let cur = outgoing(p, taskId)[0][1]; let decided = false;
  for (let i = 0; i < 10; i++) {
    const m = nodeById(p, cur)!;
    if (m.type === 'exclusiveGateway') { const fl = outgoing(p, cur); cur = (fl.find((f) => f[3] && evalCondition(f[3], vars)) ?? fl.find((f) => f[1] === m.defaultTo) ?? fl[0])[1]; decided = true; continue; }
    if (!decided && (m.type === 'serviceTask' || m.type === 'businessRuleTask')) { cur = outgoing(p, cur)[0][1]; continue; }
    break;
  }
  return { to: cur, vars };
}
const item = (o: Record<string, unknown> = {}) => ({ item: 'Item', owner: 'Owner', ...o });

section('Generic forms: decisions, open items and the engine mapping', () => {
  ok(route('P05', 'approve', { approvalDecision: 'reject', rejectionReason: 'Window clashes' }).to === 'end_rejected', 'approve: reject ends a change as rejected');
  ok(route('P05', 'approve', { approvalDecision: 'conditions', conditions: 'Vendor on site' }).to === 'schedule', 'approve: approve with conditions goes on');
  ok(route('P05', 'approve', { approvalDecision: 'approve' }).to === 'schedule', 'approve: approve goes on');
  ok(computed('approve', { approvalDecision: 'reject' }).approved === false && computed('approve', { approvalDecision: 'conditions' }).approved === true, 'approve: approved follows the decision');
  ok(computed('approve', {}).approved === null, 'approve: nothing decided yet, approved is empty');
  ok(!hidden('approve', 'Field_rejectionReason', { approvalDecision: 'reject' }) && hidden('approve', 'Field_rejectionReason', { approvalDecision: 'approve' }), 'approve: the reason field shows only on reject');
  ok(!hidden('approve', 'Field_conditions', { approvalDecision: 'conditions' }) && hidden('approve', 'Field_conditions', {}), 'approve: the conditions field shows only with conditions');
  ok(normaliseVariables({ approvalDecision: 'reject' }, { approvalDecision: 'reject' }).approved === false, 'engine: approved derived from the decision when the expression did not run');
  ok(route('P01', 'audit_walk', { summary: 'Walked H1', openItemsList: [item(), item()] }).to === 'resolve_exceptions', 'complete-with-evidence: open items → exceptions');
  ok(route('P01', 'audit_walk', { summary: 'Walked H1', openItemsList: [] }).to === 'baseline', 'complete-with-evidence: no open items → baseline');
  ok(route('P07', 'verify', { summary: 'Wave 1 verified', openItemsList: [item({ item: 'Wave 2' })] }).to === 'approve_wave', 'complete-with-evidence: remaining waves loop');
  ok(route('P07', 'verify', { summary: 'Last wave verified', openItemsList: [] }).to === 'close', 'complete-with-evidence: no waves left closes');
  ok(route('P08', 'resolve_blockers', { summary: 'Cleared', openItemsList: [] }).to === 'cease', 'complete-with-evidence: no blockers → cease');
  ok(route('P08', 'resolve_blockers', { summary: 'One left', openItemsList: [item()] }).to === 'resolve_blockers', 'complete-with-evidence: a blocker remains → resolve again');
  ok(route('PRJ-15', 'consent', { summary: 'Chased', openItemsList: [item({ item: 'Tenant B' })] }).to === 'consent', 'complete-with-evidence: pending consent loops');
  ok(route('PRJ-15', 'consent', { summary: 'All in', openItemsList: [] }).to === 'receive', 'complete-with-evidence: all consented → receive');
  ok(normaliseVariables({ openItemsList: [1, 2] }, { openItemsList: [1, 2] }).openItems === 2, 'engine: openItems from the list when the expression did not run');
  ok(route('P09', 'decide', { decision: 'walk', reason: 'Serial differs' }).to === 'walk', 'decide-reconciliation: walk sends a technician');
  ok(route('P09', 'decide', { decision: 'keep', reason: 'Discovery stale' }).to === 'audit', 'decide-reconciliation: keep writes the audit entry');
});

section('Purpose-built forms: expression fields drive the gateways', () => {
  const pass = { test: 'UPS transfer', result: 'pass' }, fail = { test: 'Generator start', result: 'fail' };
  ok(route('PRJ-01', 'acceptance', { tests: [pass], defectsList: [{ defect: 'Label missing', severity: 'minor' }] }).to === 'raise_backbone', 'acceptance-tests: passed with a minor defect goes on');
  const failed = route('PRJ-01', 'acceptance', { tests: [pass, fail], defectsList: [] });
  ok(failed.to === 'fix_tests' && failed.vars.failedTests === 1, 'acceptance-tests: a failed test → fix');
  ok(route('PRJ-01', 'acceptance', { tests: [pass], defectsList: [{ defect: 'Breaker trips', severity: 'blocking' }] }).to === 'fix_tests', 'acceptance-tests: a blocking defect → fix');
  ok(route('P02', 'commission', { tests: [fail] }).to === 'fix_defects', 'acceptance-tests: P02 defects gateway → fix defects');
  ok(route('P02', 'commission', { tests: [pass] }).to === 'handover', 'acceptance-tests: P02 all passed → handover');
  const mixed = computed('acceptance-tests', { tests: [pass, fail], defectsList: [{ severity: 'minor' }, { severity: 'blocking' }] });
  ok(mixed.failedTests === 2 && mixed.openItems === 3, 'acceptance-tests: failed tests count blocking defects, open items count all');
  ok(route('P04', 'closure_checks', { checks: [{ check: 'Alarms clear', result: 'pass' }] }).to === 'resolve', 'run-checks: all pass → resolve');
  ok(route('P04', 'closure_checks', { checks: [{ check: 'Alarms clear', result: 'fail' }] }).to === 'execute', 'run-checks: a failed check → remediation');
  ok(route('PRJ-06', 'prechecks', { checks: [{ check: 'Backups', result: 'fail' }] }).to === 'fix_prechecks', 'run-checks: PRJ-06 failed pre-check → fix');
  ok(route('PRJ-06', 'prechecks', { checks: [{ check: 'Backups', result: 'pass' }] }).to === 'raise_move', 'run-checks: PRJ-06 ready → move');
  ok(route('PRJ-01', 'handover', { approved: true, snagList: [{ snag: 'Door closer' }] }).to === 'close_snags', 'handover: an open snag → close snags');
  ok(route('PRJ-01', 'handover', { approved: true, snagList: [] }, { snags: 3 }).to === 'release', 'handover: no snags → release capacity (even after earlier snags)');
  ok(route('PRJ-10', 'snag_walk', { areas: 'Hall A', snagList: [{ snag: 'Tile' }] }).to === 'close_snags', 'snag-walk: a snag → close snags');
  ok(route('PRJ-09', 'completion', { areas: 'Site', snagList: [] }).to === 'end', 'snag-walk: clean walk → practical completion');
  ok(route('PRJ-06', 'confirm', { confirmations: [{ service: 'CRM', status: 'confirmed' }, { service: 'ERP', status: 'not-confirmed' }] }).to === 'rollback', 'owner-confirmation: not confirmed → roll back');
  ok(route('PRJ-06', 'confirm', { confirmations: [{ service: 'CRM', status: 'confirmed' }] }).to === 'raise_source', 'owner-confirmation: all confirmed → decommission source');
  ok(route('PRJ-07', 'drain', { confirmations: [{ service: 'Backup', status: 'not-confirmed' }] }).to === 'resolve', 'owner-confirmation: PRJ-07 not drained → resolve');
  ok(route('PRJ-01', 'check_permits', { permits: [{ permit: 'Building', status: 'pending' }] }).to === 'chase_permits', 'permit-check: pending → chase');
  ok(route('PRJ-01', 'check_permits', { permits: [{ permit: 'Building', status: 'granted' }] }).to === 'award', 'permit-check: all granted → award');
  ok(route('PRJ-07', 'wipe', { uncertified: [{ serial: 'S1' }] }).to === 'rewipe', 'media-sanitisation: uncertified media → re-wipe');
  ok(route('PRJ-07', 'wipe', { uncertified: [] }).to === 'raise_removal', 'media-sanitisation: all certified → removal');
  ok(route('PRJ-04', 'go_nogo', { goDecision: 'go', rollbackTrigger: 'Loss of A feed' }).to === 'raise_cutover', 'go-no-go: go → cut-over');
  ok(route('PRJ-04', 'go_nogo', { goDecision: 'nogo', nogoReason: 'Spares missing', openItemsList: [item()] }).to === 'fix', 'go-no-go: no go → fix');
  ok(route('P04', 'rca', { fixType: 'disruptive' }).to === 'approve_disruptive', 'root-cause: disruptive fix → approval');
  ok(route('P04', 'rca', { fixType: 'non-disruptive' }, { disruptive: true }).to === 'execute', 'root-cause: non-disruptive fix → execute');
  ok(route('PRJ-02', 'design', { approvalDecision: 'reject', rejectionReason: 'Cooling short' }).to === 'revise_design', 'design-review: reject → revise');
  ok(route('PRJ-02', 'design', { approvalDecision: 'conditions', conditions: 'Close C-12' }).to === 'release_pos', 'design-review: with conditions → release POs');
  ok(route('P06', 'approve_budget', { approvalDecision: 'reject', rejectionReason: 'Over budget' }).to === 'rework', 'commercial-approval: reject → rework');
  ok(computed('receive-delivery', { condition: 'issues', deliveryIssues: [{ item: 'PDU' }] }).openItems === 1 && computed('receive-delivery', { condition: 'ok', deliveryIssues: [{ item: 'PDU' }] }).openItems === 0, 'receive-delivery: problems count only when reported');
  ok(computed('install-record', { cableTests: 'fail', cableFailures: [{ circuit: 'A1' }], openItemsList: [item()] }).openItems === 2, 'install-record: failed cables and open items');
  ok(computed('fix-findings', { openItemsList: [] }).openItems === 0, 'fix-findings: nothing left open');
});

section('Task data: files become document references and read back by name', () => {
  const file = { name: 'report.pdf', type: 'application/pdf', size: 20480 } as File;
  const out = withDocumentReferences({ testReport: 'files::1', tests: [{ test: 'A', result: 'pass' }] }, new Map([['files::1', [file]]]));
  const ref = (out.testReport as Record<string, unknown>[])[0];
  ok(ref['camunda.document.type'] === 'camunda' && (ref.metadata as Record<string, unknown>).fileName === 'report.pdf', 'filepicker value → Camunda document reference');
  const rows = taskDataRows(FORMS['acceptance-tests'] as unknown as Record<string, unknown>, computed('acceptance-tests', out));
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  ok(byLabel['Signed test report']?.kind === 'files', 'task data: the report shows as a file');
  ok(byLabel['Tests']?.kind === 'list', 'task data: the tests show as a list');
  const cwe = taskDataRows(FORMS['complete-with-evidence'] as unknown as Record<string, unknown>, normaliseVariables(computed('complete-with-evidence', { summary: 'Done', openItemsList: [item()] })));
  ok(cwe.some((r) => r.label === 'Open items' && r.value.kind === 'list') && !cwe.some((r) => ['exceptions', 'snags', 'blocked'].includes(r.key)), 'task data: open items as a list, gateway copies not repeated');
});

section('Record-backed tasks: explained, linked, and driven by the record', () => {
  const drivers = ['src/modules/delivery/lib/chainOps.ts', 'src/modules/delivery/lib/materialOps.ts'].map((f) => readFileSync(f, 'utf8')).join('\n').split('\n').filter((l) => /driveP05|driveP10/.test(l)).join('\n');
  const TABS: Record<string, string[]> = { change: ['overview', 'approvals', 'window', 'workorder', 'process', 'review', 'history'], 'work-order': ['overview', 'assignment', 'change', 'execution', 'process', 'history'] };
  const backed = userTasks.filter((t) => t.n.completeOn === 'record');
  ok(backed.length >= 12, `record-backed tasks marked (${backed.length})`);
  for (const { p, n } of backed) {
    ok(p.key === 'change' || p.key === 'work-order', `${p.pid} ${n.id}: record-backed only on the change and work-order processes`);
    ok((n.recordAction ?? '').length > 20, `${p.pid} ${n.id}: says what to do on the record`);
    ok(!n.recordTab || TABS[p.key]?.includes(n.recordTab), `${p.pid} ${n.id}: tab "${n.recordTab}" exists on the record page`);
    ok(drivers.includes(`'${n.id}'`), `${p.pid} ${n.id}: a change or work-order action completes it`);
  }
  for (const id of ['confirm_kit', 'record_materials', 'return_parts', 'start_work', 'complete']) ok(nodeById(PROCESS_BY_KEY['work-order'], id)?.completeOn === 'record', `P10 ${id} is record-backed`);
  ok(nodeById(PROCESS_BY_KEY['change'], 'approve')?.completeOn === 'record', 'P05 approve is record-backed');
  ok(!nodeById(PROCESS_BY_KEY['change'], 'rollback')?.completeOn, 'P05 rollback keeps its form (a failed review reaches it with nothing on the record to drive it)');
  const bpmn = readFileSync('src/workorders/bpmn/work-order.bpmn', 'utf8');
  ok(bpmn.includes('<zeebe:property name="completeOn" value="record" />'), 'BPMN export carries completeOn as a zeebe property');
});

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
