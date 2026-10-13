/* Raise a change — /changes/new. One change belongs to one work order, so this creates both together
   through useChainActions().raiseWorkOrder. The right-hand panel shows, before anything is saved, the
   class the system will assign and why, the approval path, who is affected, and the freeze and clash checks.
   Required materials and equipment to retire picked here are added to the new work order
   (useMaterialActions().addLine / addRetired), then the supply chain platform is asked where the items
   can come from (checkAvailability). The retired devices count as affected equipment.
   Prefill from the URL: ?projectId=, ?dataCenterId=, ?type=, ?emergency=1. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { App, DatePicker, Form, Input, InputNumber, Radio, Select, Spin, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarClock, ClipboardList, HardHat, ListChecks, MapPin, Package, Send, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { WORK_ORDER_TYPE, type WorkOrderType } from '../../../mock/data/enums';
import { freezeFor, useDeliveryData } from '../../delivery/lib/chain';
import { planRaiseWorkOrder, useChainActions, type RaiseWorkOrderInput } from '../../delivery/lib/workflowChain';
import { usePlannerData } from '../../planner/lib/plannerData';
import { useMaterialActions, useMaterialData } from '../../delivery/lib/materialHooks';
import { MaterialPicker, RetirePicker } from '../../delivery/components/workorders/materials';
import { DEFAULT_KIT_NOTE, applyRaiseMaterials, retireOptions, type PickedItem } from '../../delivery/components/workorders/materialsView';
import type * as T from '../../../mock/data/types';
import { clashes, impactOf, nextFreeWindow } from '../../planner/lib/impact';
import { CLASS_TONE, RISK_TONE, WO_TYPE_LABEL, fmtDay, fmtTime, fmtWhen, nextBoardMeeting, peopleFor, roleLabel, siteLabel, technicians } from '../lib/model';
import { KvList, Muted, Note } from '../components/kit';

interface Values {
  type?: WorkOrderType; title?: string; description?: string; dataCenterId?: string; rackIds?: string[]; deviceIds?: string[];
  start?: Dayjs; hours?: number; kw?: number; assigneeKind: 'internal' | 'contractor'; assigneeName?: string; contractorVendorId?: string; crew?: string[];
  projectId?: string; emergency?: boolean; implementationPlan?: string; testPlan?: string; backoutPlan?: string;
}

export default function RaiseChangePage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { message } = App.useApp();
  const d = useDeliveryData();
  const pd = usePlannerData();
  const actions = useChainActions();
  const md = useMaterialData();
  const matOps = useMaterialActions();
  const [extra, setExtra] = useState<PickedItem[]>([]);
  const [retire, setRetire] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<T.RetiredDisposition>();
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);
  const preProject = sp.get('projectId') ? d.projects.find(p => p.id === sp.get('projectId')) : undefined;
  const initial: Values = {
    type: (WORK_ORDER_TYPE as readonly string[]).includes(sp.get('type') ?? '') ? sp.get('type') as WorkOrderType : undefined,
    dataCenterId: sp.get('dataCenterId') ?? preProject?.dataCenterId, projectId: preProject?.id,
    hours: 4, assigneeKind: 'internal', emergency: sp.get('emergency') === '1', rackIds: [], deviceIds: [], crew: [],
  };
  const v = Form.useWatch([], form) as Values | undefined;
  const val: Values = { ...initial, ...(v ?? {}) };

  const site = d.dataCenters.find(s => s.id === val.dataCenterId);
  const rackOpts = useMemo(() => pd.racks.filter(r => r.dataCenterId === val.dataCenterId).sort((a, b) => a.name.localeCompare(b.name)).map(r => ({ value: r.id, label: `${r.name} (${r.id})` })), [pd.racks, val.dataCenterId]);
  const rackSet = useMemo(() => new Set(val.rackIds ?? []), [val.rackIds]);
  const devOpts = useMemo(() => pd.devices.filter(x => x.dataCenterId === val.dataCenterId && (!rackSet.size || (x.rackId && rackSet.has(x.rackId)))).slice(0, 3000).map(x => ({ value: x.id, label: `${x.name} (${x.id})` })), [pd.devices, val.dataCenterId, rackSet]);
  const projOpts = useMemo(() => [...d.projects].sort((a, b) => (a.dataCenterId === val.dataCenterId ? 0 : 1) - (b.dataCenterId === val.dataCenterId ? 0 : 1) || a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: `${p.name}${p.dataCenterId === val.dataCenterId ? '' : p.dataCenterId ? ` · ${siteLabel(d.dataCenters.find(s => s.id === p.dataCenterId))}` : ''}` })), [d.projects, d.dataCenters, val.dataCenterId]);

  const rackMap = useMemo(() => new Map(pd.racks.map(r => [r.id, r])), [pd.racks]);
  const retireOpts = useMemo(() => (val.dataCenterId ? retireOptions(pd.devices, rackMap, val.dataCenterId, val.rackIds ?? []) : []), [pd.devices, rackMap, val.dataCenterId, val.rackIds]);
  // Equipment to retire is affected equipment too (impact, clashes, the change's scope).
  const deviceIds = useMemo(() => [...new Set([...(val.deviceIds ?? []), ...retire])], [val.deviceIds, retire]);
  const impact = useMemo(() => impactOf(pd, { deviceIds, rackIds: val.rackIds }), [pd, deviceIds, val.rackIds]);
  const win = val.start ? { start: val.start.toISOString(), end: val.start.add(val.hours ?? 4, 'hour').toISOString() } : undefined;
  const liveSite = site?.status === 'Operational' && (impact.deviceIds.length > 0);
  const project = d.projects.find(p => p.id === val.projectId);

  const input: RaiseWorkOrderInput | undefined = val.type && win ? {
    type: val.type, title: val.title?.trim() || WO_TYPE_LABEL[val.type], description: val.description?.trim() || undefined, dataCenterId: val.dataCenterId,
    projectId: project?.id, programId: project?.programId, plannerPlanId: project?.plannerPlanId,
    plannedStart: win.start, plannedEnd: win.end, deviceIds, rackIds: val.rackIds,
    assigneeKind: val.assigneeKind, assigneeName: val.assigneeName, contractorVendorId: val.assigneeKind === 'contractor' ? val.contractorVendorId : undefined, crew: val.crew,
    emergency: !!val.emergency, kw: val.kw, criticalServices: impact.critical > 0, liveSite,
    implementationPlan: val.implementationPlan?.trim() || undefined, testPlan: val.testPlan?.trim() || undefined, backoutPlan: val.backoutPlan?.trim() || undefined,
  } : undefined;
  const preview = input ? planRaiseWorkOrder(d, input, actions.actor, { wo: 'WO-new', chg: 'CHG-new', step: i => `APS-new-${i}` }) : undefined;
  const freeze = win ? freezeFor(d, val.dataCenterId, win.start, win.end) : undefined;
  const clash = useMemo(() => win ? clashes(pd, { dataCenterId: val.dataCenterId, deviceIds, rackIds: val.rackIds, ...win }) : [], [pd, win?.start, win?.end, val.dataCenterId, deviceIds, val.rackIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = preview?.change.changeClass;
  const rule = preview?.change.approvalRuleId ? d.approvalMatrixRules.find(r => r.id === preview.change.approvalRuleId) : undefined;
  const template = preview?.workOrder.standardTemplateId ? d.standardChangeTemplates.find(t => t.id === preview.workOrder.standardTemplateId) : undefined;
  const blocked = (!!freeze && cls !== 'Emergency') || clash.some(x => x.severity === 'block');

  const suggest = () => {
    if (!val.dataCenterId) { message.info('Pick the site first'); return; }
    const w = nextFreeWindow(pd, { dataCenterId: val.dataCenterId, deviceIds, rackIds: val.rackIds, hours: val.hours ?? 4, after: new Date(Date.now() + 86400e3).toISOString() });
    let s = dayjs(w.start);
    for (let i = 0; i < 60 && !val.emergency; i++) {
      const f = freezeFor(d, val.dataCenterId, s.toISOString(), s.add(val.hours ?? 4, 'hour').toISOString()); if (!f) break;
      s = dayjs(nextFreeWindow(pd, { dataCenterId: val.dataCenterId, deviceIds, rackIds: val.rackIds, hours: val.hours ?? 4, after: f.end }).start);
    }
    form.setFieldValue('start', s);
  };

  const raise = async (submit: boolean) => {
    const ok = await form.validateFields().catch(() => null); if (!ok || !input) return;
    setBusy(true);
    try {
      const p = actions.raiseWorkOrder(d, input);
      const impactText = impact.services.length ? `${impact.services.length} service(s) for ${impact.customers.length} customer(s)${impact.critical ? `, ${impact.critical} critical` : ''}` : 'No customer impact expected';
      actions.scheduleChange(p.change.id, input.plannedStart, input.plannedEnd, impactText);
      if (submit && p.change.changeClass !== 'Standard') actions.submitChange(p.change.id);
      const m = applyRaiseMaterials(matOps, p.workOrder.id, { items: extra, retire, disposition });
      if (m.errors.length) message.warning(`Materials: ${m.errors.join('; ')}. The change is raised; finish them on its Materials tab.`);
      message.success(`${p.change.id} raised as ${(p.change.changeClass ?? "normal").toLowerCase()} with work order ${p.workOrder.id}${p.change.changeClass === 'Standard' ? '; approved by its template' : submit ? '; submitted for approval' : '; saved as a draft'}`);
      navigate(`/changes/${p.change.id}${extra.length || retire.length ? '?tab=materials' : ''}`);
    } finally { setBusy(false); }
  };

  if (!d.ready || !pd.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

  return (
    <OpsPage title="Raise a change" description="Every change comes with its work order: describe the work, where and when, and who does it. The system decides whether it is a standard, normal or emergency change.">
      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <Form form={form} layout="vertical" initialValues={initial} className="col" style={{ gap: 18 }}>
          <Panel title="The work" icon={ClipboardList}>
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <Form.Item name="type" label="Work type" rules={[{ required: true, message: 'Pick the kind of work' }]} style={{ marginBottom: 0 }}>
                <Select placeholder="Select the work type" showSearch optionFilterProp="label" options={WORK_ORDER_TYPE.map(t => ({ value: t, label: WO_TYPE_LABEL[t] ?? t }))} />
              </Form.Item>
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Give the change a short title' }]} style={{ marginBottom: 0 }}><Input placeholder="e.g. Install 4 racks in Hall 2 row C" /></Form.Item>
            </div>
            <Form.Item name="description" label="Why the work is needed" style={{ marginTop: 12, marginBottom: 0 }}><Input.TextArea rows={2} placeholder="The reason and the outcome expected" /></Form.Item>
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: 12 }}>
              <Form.Item name="projectId" label="Project (optional)" style={{ marginBottom: 0 }} tooltip="Work for a build project; leave empty for operational work">
                <Select allowClear showSearch optionFilterProp="label" placeholder="No project: operational work" options={projOpts} />
              </Form.Item>
              <Form.Item name="emergency" label="Emergency" valuePropName="checked" style={{ marginBottom: 0 }} tooltip="Only for work that cannot wait for the weekly board, such as restoring service">
                <Switch />
              </Form.Item>
            </div>
          </Panel>

          <Panel title="Where" icon={MapPin}>
            <Form.Item name="dataCenterId" label="Site" rules={[{ required: true, message: 'Pick the site' }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select the site" onChange={() => { form.setFieldsValue({ rackIds: [], deviceIds: [] }); setRetire([]); }} options={d.dataCenters.map(s => ({ value: s.id, label: `${siteLabel(s)} · ${s.name}` }))} />
            </Form.Item>
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <Form.Item name="rackIds" label="Racks" style={{ marginBottom: 0 }}><Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={val.dataCenterId ? 'Racks touched' : 'Pick the site first'} disabled={!val.dataCenterId} options={rackOpts} maxTagCount="responsive" /></Form.Item>
              <Form.Item name="deviceIds" label="Devices" style={{ marginBottom: 0 }}><Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={val.dataCenterId ? 'Devices touched' : 'Pick the site first'} disabled={!val.dataCenterId} options={devOpts} maxTagCount="responsive" /></Form.Item>
            </div>
            <Form.Item name="kw" label="Load added (kW, optional)" style={{ marginTop: 12, marginBottom: 0 }} tooltip="Standard templates have a kW limit"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          </Panel>

          <Panel title="When" icon={CalendarClock}>
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', alignItems: 'end' }}>
              <Form.Item name="start" label="Window start" rules={[{ required: true, message: 'Pick the start of the window' }]} style={{ marginBottom: 0 }}><DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="D MMM YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="hours" label="Hours" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber min={1} max={72} style={{ width: '100%' }} /></Form.Item>
              <Btn icon={Sparkles} onClick={suggest}>Suggest next free window</Btn>
            </div>
            <div style={{ marginTop: 8 }}><Muted size="xs">Change nights are Tuesday to Thursday and Saturday from 22:00 UTC. The suggestion skips clashes{val.emergency ? '' : ' and freezes'}.</Muted></div>
          </Panel>

          <Panel title="Who does it" icon={HardHat}>
            <Form.Item name="assigneeKind" label="Assign to" style={{ marginBottom: 12 }}>
              <Radio.Group options={[{ value: 'internal', label: 'Own technicians' }, { value: 'contractor', label: 'A contractor company' }]} />
            </Form.Item>
            {val.assigneeKind === 'contractor' ? (
              <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                <Form.Item name="contractorVendorId" label="Contractor" rules={[{ required: true, message: 'Pick the contractor' }]} style={{ marginBottom: 0 }}><Select showSearch optionFilterProp="label" placeholder="Select the vendor" options={d.vendors.map(x => ({ value: x.id, label: `${x.name} · ${x.category}` }))} /></Form.Item>
                <Form.Item name="assigneeName" label="Lead on site" style={{ marginBottom: 0 }}><Input placeholder="Name of the contractor's lead" /></Form.Item>
                <Form.Item name="crew" label="Crew" style={{ marginBottom: 0, gridColumn: '1 / -1' }} tooltip="Names of the crew; they need a site access request before arrival"><Select mode="tags" placeholder="Type a name and press Enter" /></Form.Item>
              </div>
            ) : (
              <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                <Form.Item name="assigneeName" label="Technician" style={{ marginBottom: 0 }}><Select allowClear showSearch placeholder="Assign later" options={technicians().map(p => ({ value: p.name, label: `${p.name} · ${p.role}${p.site ? ` (${p.site})` : ''}` }))} /></Form.Item>
                <Form.Item name="crew" label="Crew (optional)" style={{ marginBottom: 0 }}><Select mode="tags" placeholder="Others on the job" options={technicians().map(p => ({ value: p.name, label: p.name }))} /></Form.Item>
              </div>
            )}
          </Panel>

          <Panel title="Plans" icon={ListChecks} sub={template ? "Left empty, the template's steps and backout are used" : undefined}>
            <Form.Item name="implementationPlan" label="Implementation plan"><Input.TextArea rows={3} placeholder={template ? template.steps.join('\n') : 'The steps, in order'} /></Form.Item>
            <Form.Item name="testPlan" label="Test plan"><Input.TextArea rows={2} placeholder="How the work is proven to be right" /></Form.Item>
            <Form.Item name="backoutPlan" label="Backout plan" style={{ marginBottom: 0 }}><Input.TextArea rows={2} placeholder={template?.backout ?? 'How the work is reversed if a test fails'} /></Form.Item>
          </Panel>

          <Panel title="Materials (optional)" icon={Package}>
            <div className="col" style={{ gap: 18 }}>
              <div className="col" style={{ gap: 8 }}>
                <span className="strong">Required materials</span>
                <Muted>{DEFAULT_KIT_NOTE}{template?.kit?.length ? ` The template "${template.name}" brings ${template.kit.length} item${template.kit.length === 1 ? '' : 's'}.` : ''}</Muted>
                <MaterialPicker value={extra} onChange={setExtra} materials={md.materials} />
              </div>
              <div className="col" style={{ gap: 8 }}>
                <span className="strong">Equipment to retire</span>
                <Muted>Devices this work removes from the estate{val.rackIds?.length ? ', in the racks picked above' : ''}. Each becomes a line coming out, with its disposition (back to stock, redeploy, back to the vendor or dispose) decided now or later.</Muted>
                <RetirePicker value={retire} onChange={setRetire} options={retireOpts} disposition={disposition} onDisposition={setDisposition} disabledText={val.dataCenterId ? undefined : 'Pick the site first'} />
              </div>
              <Muted size="xs">After raising, the supply chain platform is asked where each item can come from. Availability is advice: it does not block approval.</Muted>
            </div>
          </Panel>
        </Form>

        <div className="col" style={{ gap: 18, position: 'sticky', top: 12 }}>
          <Panel title="What the system will do" icon={Wand2}>
            {!preview ? <p className="vw-label" style={{ margin: 0 }}>Pick the work type and the window to see the class this change gets and its approval path.</p> : (
              <div className="col" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Chip tone={CLASS_TONE[cls!]}>{cls} change</Chip><Chip tone={RISK_TONE[preview.change.risk] ?? 'neutral'}>{preview.change.risk} risk</Chip></div>
                <div>
                  <Muted>Why</Muted>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{preview.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div>
                  <Muted>Approval</Muted>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    {cls === 'Standard' ? <>Approved at once by template {template?.name ?? ''}. No change board; the work order is ready to assign.</>
                      : cls === 'Emergency' ? <>Emergency board, on demand. The work can start once approved; a review afterwards is mandatory.</>
                      : <>Change board on {fmtDay(nextBoardMeeting().toISOString())}{rule ? `, rule "${rule.name}"` : ''}: {preview.approvals.map(a => roleLabel(a.approverRole)).join(' → ') || 'change manager'}.</>}
                  </div>
                  {cls !== 'Standard' && preview.approvals.length > 0 && <Muted size="xs">{preview.approvals.map(a => `${roleLabel(a.approverRole)}: ${peopleFor(a.approverRole).map(p => p.name).join(', ') || 'nobody holds this role'}`).join(' · ')}</Muted>}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Checks" icon={ShieldCheck}>
            <KvList columns={2} items={[
              { label: 'Affected', value: impact.deviceIds.length || (val.rackIds?.length ?? 0) ? `${impact.services.length} service(s), ${impact.customers.length} customer(s)${impact.critical ? `, ${impact.critical} critical` : ''}` : 'No equipment picked' },
              { label: 'Live area', value: liveSite ? 'Yes: equipment in service at an operational site' : 'No' },
              { label: 'Freeze', value: !win ? 'Pick a window' : freeze ? <span style={{ color: cls === 'Emergency' ? 'var(--vw-color-amber-700)' : 'var(--vw-color-red-600)' }}>{freeze.name}{cls === 'Emergency' ? ' (allowed as an emergency)' : ': move the window or raise as an emergency'}</span> : 'None' },
              { label: 'Clashes', value: !win ? 'Pick a window' : clash.length === 0 ? 'None' : <span>{clash.map((x, i) => <span key={x.id}>{i > 0 && '; '}{x.kind === 'change' ? <Link to={`/changes/${x.id}`}>{x.id}</Link> : x.id}{x.severity === 'block' ? ' (same equipment, same time)' : ' (check)'}</span>)}</span> },
              { label: 'Window', value: win ? `${fmtWhen(win.start)} to ${fmtTime(win.end)}` : '—' },
              { label: 'Materials', value: extra.some(x => x.materialId) || retire.length ? [extra.filter(x => x.materialId).length && `${extra.filter(x => x.materialId).length} extra item(s) going in`, retire.length && `${retire.length} device(s) to retire`].filter(Boolean).join(' · ') : template?.kit?.length ? `The template's kit (${template.kit.length} item${template.kit.length === 1 ? '' : 's'})` : 'The default kit for the work, if any' },
            ]} />
          </Panel>

          <Panel>
            <div className="col" style={{ gap: 10 }}>
              {blocked && <Note tone="bad">The window clashes with other work or falls in a freeze. Move it before raising.</Note>}
              {cls === 'Standard'
                ? <Btn variant="filled" block icon={Send} disabled={busy || !preview || blocked} onClick={() => void raise(false)}>Raise standard change</Btn>
                : <>
                  <Btn variant="filled" block icon={Send} disabled={busy || !preview || blocked} onClick={() => void raise(true)}>Raise and submit for approval</Btn>
                  <Btn block disabled={busy || !preview} onClick={() => void raise(false)}>Save as draft</Btn>
                </>}
              <Muted size="xs">Creates work order and change together{project ? ` under project ${project.name}` : ''}.</Muted>
            </div>
          </Panel>
        </div>
      </div>
    </OpsPage>
  );
}
