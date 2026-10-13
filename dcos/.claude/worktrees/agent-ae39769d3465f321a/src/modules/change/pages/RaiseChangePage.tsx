/* Raise a change — /changes/new. One change belongs to one work order, so this creates both together
   through useChainActions().raiseWorkOrder. The right-hand panel shows, before anything is saved, the
   class the system will assign and why, the approval path, who is affected, and the freeze and clash checks.
   Prefill from the URL: ?projectId=, ?dataCenterId=, ?type=, ?emergency=1. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { App, DatePicker, Form, Input, InputNumber, Radio, Select, Spin, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { DetailPageHeader, VwCard, VwChip } from '../../../shared/components/ux';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { WORK_ORDER_TYPE, type WorkOrderType } from '../../../mock/data/enums';
import { freezeFor, useDeliveryData } from '../../delivery/lib/chain';
import { planRaiseWorkOrder, useChainActions, type RaiseWorkOrderInput } from '../../delivery/lib/workflowChain';
import { usePlannerData } from '../../planner/lib/plannerData';
import { clashes, impactOf, nextFreeWindow } from '../../planner/lib/impact';
import { CLASS_TONE, RISK_TONE, WO_TYPE_LABEL, fmtDay, fmtTime, fmtWhen, nextBoardMeeting, peopleFor, roleLabel, siteLabel, technicians } from '../lib/model';
import { KvList, Muted } from '../components/kit';

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

  const impact = useMemo(() => impactOf(pd, { deviceIds: val.deviceIds, rackIds: val.rackIds }), [pd, val.deviceIds, val.rackIds]);
  const win = val.start ? { start: val.start.toISOString(), end: val.start.add(val.hours ?? 4, 'hour').toISOString() } : undefined;
  const liveSite = site?.status === 'Operational' && (impact.deviceIds.length > 0);
  const project = d.projects.find(p => p.id === val.projectId);

  const input: RaiseWorkOrderInput | undefined = val.type && win ? {
    type: val.type, title: val.title?.trim() || WO_TYPE_LABEL[val.type], description: val.description?.trim() || undefined, dataCenterId: val.dataCenterId,
    projectId: project?.id, programId: project?.programId, plannerPlanId: project?.plannerPlanId,
    plannedStart: win.start, plannedEnd: win.end, deviceIds: val.deviceIds, rackIds: val.rackIds,
    assigneeKind: val.assigneeKind, assigneeName: val.assigneeName, contractorVendorId: val.assigneeKind === 'contractor' ? val.contractorVendorId : undefined, crew: val.crew,
    emergency: !!val.emergency, kw: val.kw, criticalServices: impact.critical > 0, liveSite,
    implementationPlan: val.implementationPlan?.trim() || undefined, testPlan: val.testPlan?.trim() || undefined, backoutPlan: val.backoutPlan?.trim() || undefined,
  } : undefined;
  const preview = input ? planRaiseWorkOrder(d, input, actions.actor, { wo: 'WO-new', chg: 'CHG-new', step: i => `APS-new-${i}` }) : undefined;
  const freeze = win ? freezeFor(d, val.dataCenterId, win.start, win.end) : undefined;
  const clash = useMemo(() => win ? clashes(pd, { dataCenterId: val.dataCenterId, deviceIds: val.deviceIds, rackIds: val.rackIds, ...win }) : [], [pd, win?.start, win?.end, val.dataCenterId, val.deviceIds, val.rackIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = preview?.change.changeClass;
  const rule = preview?.change.approvalRuleId ? d.approvalMatrixRules.find(r => r.id === preview.change.approvalRuleId) : undefined;
  const template = preview?.workOrder.standardTemplateId ? d.standardChangeTemplates.find(t => t.id === preview.workOrder.standardTemplateId) : undefined;
  const blocked = (!!freeze && cls !== 'Emergency') || clash.some(x => x.severity === 'block');

  const suggest = () => {
    if (!val.dataCenterId) { message.info('Pick the site first'); return; }
    const w = nextFreeWindow(pd, { dataCenterId: val.dataCenterId, deviceIds: val.deviceIds, rackIds: val.rackIds, hours: val.hours ?? 4, after: new Date(Date.now() + 86400e3).toISOString() });
    let s = dayjs(w.start);
    for (let i = 0; i < 60 && !val.emergency; i++) {
      const f = freezeFor(d, val.dataCenterId, s.toISOString(), s.add(val.hours ?? 4, 'hour').toISOString()); if (!f) break;
      s = dayjs(nextFreeWindow(pd, { dataCenterId: val.dataCenterId, deviceIds: val.deviceIds, rackIds: val.rackIds, hours: val.hours ?? 4, after: f.end }).start);
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
      message.success(`${p.change.id} raised as ${(p.change.changeClass ?? "normal").toLowerCase()} with work order ${p.workOrder.id}${p.change.changeClass === 'Standard' ? '; approved by its template' : submit ? '; submitted for approval' : '; saved as a draft'}`);
      navigate(`/changes/${p.change.id}`);
    } finally { setBusy(false); }
  };

  if (!d.ready || !pd.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader backTo="/changes" backLabel="Changes" name="Raise a change" sticky={false}
        subtitle="Every change comes with its work order: describe the work, where and when, and who does it. The system decides whether it is a standard, normal or emergency change." />
      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 400px)', alignItems: 'start' }}>
        <Form form={form} layout="vertical" initialValues={initial} className="vw-flex vw-flex-col vw-gap-md">
          <VwCard title="The work">
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
          </VwCard>

          <VwCard title="Where">
            <Form.Item name="dataCenterId" label="Site" rules={[{ required: true, message: 'Pick the site' }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select the site" onChange={() => form.setFieldsValue({ rackIds: [], deviceIds: [] })} options={d.dataCenters.map(s => ({ value: s.id, label: `${siteLabel(s)} · ${s.name}` }))} />
            </Form.Item>
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <Form.Item name="rackIds" label="Racks" style={{ marginBottom: 0 }}><Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={val.dataCenterId ? 'Racks touched' : 'Pick the site first'} disabled={!val.dataCenterId} options={rackOpts} maxTagCount="responsive" /></Form.Item>
              <Form.Item name="deviceIds" label="Devices" style={{ marginBottom: 0 }}><Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder={val.dataCenterId ? 'Devices touched' : 'Pick the site first'} disabled={!val.dataCenterId} options={devOpts} maxTagCount="responsive" /></Form.Item>
            </div>
            <Form.Item name="kw" label="Load added (kW, optional)" style={{ marginTop: 12, marginBottom: 0 }} tooltip="Standard templates have a kW limit"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          </VwCard>

          <VwCard title="When">
            <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', alignItems: 'end' }}>
              <Form.Item name="start" label="Window start" rules={[{ required: true, message: 'Pick the start of the window' }]} style={{ marginBottom: 0 }}><DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="D MMM YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="hours" label="Hours" rules={[{ required: true }]} style={{ marginBottom: 0 }}><InputNumber min={1} max={72} style={{ width: '100%' }} /></Form.Item>
              <Button onClick={suggest}>Suggest next free window</Button>
            </div>
            <div style={{ marginTop: 8 }}><Muted size="xs">Change nights are Tuesday to Thursday and Saturday from 22:00 UTC. The suggestion skips clashes{val.emergency ? '' : ' and freezes'}.</Muted></div>
          </VwCard>

          <VwCard title="Who does it">
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
          </VwCard>

          <VwCard title="Plans" extra={template ? <Muted>Left empty, the template's steps and backout are used</Muted> : undefined}>
            <Form.Item name="implementationPlan" label="Implementation plan"><Input.TextArea rows={3} placeholder={template ? template.steps.join('\n') : 'The steps, in order'} /></Form.Item>
            <Form.Item name="testPlan" label="Test plan"><Input.TextArea rows={2} placeholder="How the work is proven to be right" /></Form.Item>
            <Form.Item name="backoutPlan" label="Backout plan" style={{ marginBottom: 0 }}><Input.TextArea rows={2} placeholder={template?.backout ?? 'How the work is reversed if a test fails'} /></Form.Item>
          </VwCard>
        </Form>

        <div className="vw-flex vw-flex-col vw-gap-md" style={{ position: 'sticky', top: 12 }}>
          <VwCard title="What the system will do">
            {!preview ? <div className="vw-card-description">Pick the work type and the window to see the class this change gets and its approval path.</div> : (
              <div className="vw-flex vw-flex-col vw-gap-sm">
                <div className="vw-flex vw-items-center vw-gap-xs vw-wrap"><VwChip variant={CLASS_TONE[cls!]}>{cls} change</VwChip><VwChip variant={RISK_TONE[preview.change.risk] ?? 'neutral'}>{preview.change.risk} risk</VwChip></div>
                <div>
                  <Muted>Why</Muted>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-800)' }}>{preview.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div>
                  <Muted>Approval</Muted>
                  <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-800)', marginTop: 2 }}>
                    {cls === 'Standard' ? <>Approved at once by template {template?.name ?? ''}. No change board; the work order is ready to assign.</>
                      : cls === 'Emergency' ? <>Emergency board, on demand. The work can start once approved; a review afterwards is mandatory.</>
                      : <>Change board on {fmtDay(nextBoardMeeting().toISOString())}{rule ? `, rule "${rule.name}"` : ''}: {preview.approvals.map(a => roleLabel(a.approverRole)).join(' → ') || 'change manager'}.</>}
                  </div>
                  {cls !== 'Standard' && preview.approvals.length > 0 && <Muted size="xs">{preview.approvals.map(a => `${roleLabel(a.approverRole)}: ${peopleFor(a.approverRole).map(p => p.name).join(', ') || 'nobody holds this role'}`).join(' · ')}</Muted>}
                </div>
              </div>
            )}
          </VwCard>

          <VwCard title="Checks">
            <KvList items={[
              { label: 'Affected', value: impact.deviceIds.length || (val.rackIds?.length ?? 0) ? `${impact.services.length} service(s), ${impact.customers.length} customer(s)${impact.critical ? `, ${impact.critical} critical` : ''}` : 'No equipment picked' },
              { label: 'Live area', value: liveSite ? 'Yes: equipment in service at an operational site' : 'No' },
              { label: 'Freeze', value: !win ? 'Pick a window' : freeze ? <span style={{ color: cls === 'Emergency' ? 'var(--vw-color-amber-700)' : 'var(--vw-color-red-600)' }}>{freeze.name}{cls === 'Emergency' ? ' (allowed as an emergency)' : ': move the window or raise as an emergency'}</span> : 'None' },
              { label: 'Clashes', value: !win ? 'Pick a window' : clash.length === 0 ? 'None' : <span>{clash.map((x, i) => <span key={x.id}>{i > 0 && '; '}{x.kind === 'change' ? <Link to={`/changes/${x.id}`}>{x.id}</Link> : x.id}{x.severity === 'block' ? ' (same equipment, same time)' : ' (check)'}</span>)}</span> },
              { label: 'Window', value: win ? `${fmtWhen(win.start)} to ${fmtTime(win.end)}` : '—' },
            ]} />
          </VwCard>

          <VwCard>
            <div className="vw-flex vw-flex-col vw-gap-sm">
              {blocked && <div className="vw-card-description" style={{ color: 'var(--vw-color-red-600)' }}>The window clashes with other work or falls in a freeze. Move it before raising.</div>}
              {cls === 'Standard'
                ? <Button type="primary" loading={busy} disabled={!preview || blocked} onClick={() => void raise(false)}>Raise standard change</Button>
                : <>
                  <Button type="primary" loading={busy} disabled={!preview || blocked} onClick={() => void raise(true)}>Raise and submit for approval</Button>
                  <Button loading={busy} disabled={!preview} onClick={() => void raise(false)}>Save as draft</Button>
                </>}
              <Muted size="xs">Creates work order and change together{project ? ` under project ${project.name}` : ''}.</Muted>
            </div>
          </VwCard>
        </div>
      </div>
    </div>
  );
}
