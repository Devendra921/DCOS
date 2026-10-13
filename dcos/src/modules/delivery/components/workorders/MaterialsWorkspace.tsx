/* Materials workspace: one place to manage the materials of a work order and its change. One change
   per work order, so both pages show and edit the same lines with the same actions.
   - Required materials (going in): quantity, where each item can come from (the supply chain
     platform's availability answer), reservation, kit and need-by dates.
   - Retired equipment (coming out): what happens to each removed item, whether it holds data, its
     sanitisation record and where it has got to.
   - Spares and consumption: planned against used; then the requests sent to the platform and the
     material history.
   The work order also gets the crew's steps (confirm the kit, record materials, return parts).
   Availability and kit readiness are advisory: nothing here blocks approval or the start of work.
   Writes go through useMaterialActions() only. */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { App, Checkbox, InputNumber, Select, Tooltip } from 'antd';
import type * as T from '../../../../mock/data/types';
import { AlertTriangle, ArrowLeftRight, History, Info, PackageMinus, PackageOpen, PackagePlus, Truck } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import { useMaterialActions, useMaterialData } from '../../lib/materialHooks';
import {
  AVAILABILITY_TONE, LINE_STATUS_TONE, availabilityOf, eventsOfWorkOrder, fmtQty, isUsed, lineLate, reached, readinessOf, requestsOfWorkOrder, retiredOf, supplierLate, usageOf,
  type AvailabilityView, type ReadinessView, type RetiredView,
} from '../../lib/materialRules';
import { DataTable, KvList, Muted, TwoLine, type SummaryItem } from '../home/kit';
import { NOT_DONE, fmtDateTime, fmtDay, fmtMoney } from './model';
import { ReadinessChip } from './materials';
import {
  DISPOSITIONS, DISPOSITION_TONE, SOURCE_TONE, SR_KIND_LABEL, SR_TONE, availabilityFigures, dispositionSummary, estimatedCost, isOpenRequest, kitNotReady,
  lineEditable, materialWarnings, nextSrStatus, retiredStatus, srStatusLabel, toReturn,
} from './materialsView';
import { AddItemModal, ConfirmKitModal, RecordModal, RemoveLineModal, RetireDevicesModal, ReturnModal, SanitisationModal } from './materialDialogs';

const NONE: never[] = [];
const SOURCE_LABEL: Record<T.MaterialLine['source'], string> = { Purchase: 'Purchase', Stock: 'Stock', Reuse: 'From the estate' };
type Ask = 'confirm' | 'record' | 'return' | 'add-in' | 'add-out' | 'retire' | null;

/** Run a material action and report its error in plain words instead of failing the page. */
function useRun() {
  const { message } = App.useApp();
  return <R,>(fn: () => R, ok: string | ((r: R) => string)) => {
    try { const r = fn(); message.success(typeof ok === 'function' ? ok(r) : ok); return true; } catch (e) { message.error((e as Error).message); return false; }
  };
}

export interface MaterialsWorkspaceProps {
  wo: T.WorkOrder;
  change?: T.ChangeRequest;
  /** The lines of the work order (= the lines of its change), in and out. */
  lines: T.MaterialLine[];
  /** Site and racks of the work: the scope of the "equipment to retire" picker. */
  siteId?: string; rackIds: string[];
  /** Need-by date for a kit request (the start of the window). */
  needBy?: string;
  /** The work order page adds the crew's steps; the change page links to them. */
  where: 'change' | 'workOrder';
}

export function MaterialsWorkspace({ wo, change, lines, siteId, rackIds, needBy, where }: MaterialsWorkspaceProps) {
  const md = useMaterialData();
  const ops = useMaterialActions();
  const run = useRun();
  const [ask, setAsk] = useState<Ask>(null);
  const [removing, setRemoving] = useState<T.MaterialLine | null>(null);
  const [sanitising, setSanitising] = useState<T.MaterialLine | null>(null);
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<T.RetiredDisposition>();

  const mats = useMemo(() => new Map(md.materials.map(m => [m.id, m])), [md.materials]);
  const reqs = useMemo(() => requestsOfWorkOrder(md, wo.id), [md, wo.id]);
  const events = useMemo(() => eventsOfWorkOrder(md, wo.id), [md, wo.id]);
  const devIds = useMemo(() => [...new Set(lines.flatMap(l => [...(l.deviceIds ?? []), ...(l.installedDeviceIds ?? [])]))], [lines]);
  const devList = (useEntityList('devices', { pageSize: 500, filters: [{ field: 'id', operator: 'in', value: devIds }] }).data?.data ?? NONE) as unknown as T.Device[];
  const devices = useMemo(() => new Map((devIds.length ? devList : NONE as T.Device[]).map(x => [x.id, x])), [devList, devIds.length]);
  const devRackIds = useMemo(() => [...new Set([...devices.values()].map(x => x.rackId).filter((x): x is string => !!x))], [devices]);
  const rackList = (useEntityList('racks', { pageSize: 500, filters: [{ field: 'id', operator: 'in', value: devRackIds }] }).data?.data ?? NONE) as unknown as T.Rack[];
  const racks = useMemo(() => new Map((devRackIds.length ? rackList : NONE as T.Rack[]).map(r => [r.id, r])), [rackList, devRackIds.length]);
  const certIds = useMemo(() => [...new Set(lines.map(l => l.disposalCertificateId).filter((x): x is string => !!x))], [lines]);
  const certList = (useEntityList('disposalCertificates', { pageSize: 200, filters: [{ field: 'id', operator: 'in', value: certIds }] }).data?.data ?? NONE) as unknown as T.DisposalCertificate[];
  const certs = useMemo(() => new Map((certIds.length ? certList : NONE as T.DisposalCertificate[]).map(c => [c.id, c])), [certList, certIds.length]);

  const inLines = useMemo(() => lines.filter(l => l.direction === 'In'), [lines]);
  const outLines = useMemo(() => lines.filter(l => l.direction === 'Out'), [lines]);
  const open = NOT_DONE.includes(wo.status);
  const kit = useMemo(() => readinessOf(lines), [lines]);
  const avail = useMemo(() => availabilityOf(lines), [lines]);
  const retired = useMemo(() => retiredOf(lines), [lines]);
  const usage = usageOf(lines, wo);
  const cost = estimatedCost(lines, mats);
  const warnings = materialWarnings({ kit, availability: avail, retired, lines, open });
  const afterApproval = lines.filter(l => l.changedAfterApproval);
  const approved = !!change && !!change.approvedAt;
  const lastChecked = inLines.map(l => l.availability?.checkedAt).filter((x): x is string => !!x).sort().pop();

  // Actions on the required items.
  const kits = reqs.filter(r => r.kind === 'Kit');
  const openKit = kits.find(isOpenRequest);
  const returns = reqs.filter(r => r.kind === 'Return' || r.kind === 'RMA');
  const needKit = open && !openKit && inLines.some(l => ['Planned', 'Ordered', 'Received'].includes(l.status));
  const canCheck = open && avail.open > 0;
  const canReserve = open && inLines.some(l => !reached(l, 'Delivered to site') && l.status !== 'Returned' && (l.reservedQty ?? 0) < l.quantity);
  // The crew's steps (work order only).
  const canConfirm = open && !!kits[0] && ['In progress', 'Delivered'].includes(kits[0].status);
  const canRecord = lines.length > 0 && !wo.materialsRecordedAt && ['InProgress', 'Completed', 'Validated', 'Failed'].includes(wo.status);
  const back = toReturn(lines);
  const canReturn = !!wo.materialsRecordedAt && (back.stores.length + back.rma.length) > 0 && !returns.length;
  const sim = reqs.filter(r => nextSrStatus(r));

  const requestKit = () => run(() => { if (!ops.requestKit(wo.id, { needBy })) throw new Error('Nothing to kit: every item is already requested or at the site.'); }, 'Kit requested from the supply chain platform');
  const check = () => run(() => ops.checkAvailability(wo.id), ls => `Availability checked for ${ls.length} item${ls.length === 1 ? '' : 's'}`);
  const reserve = () => run(() => { const r = ops.reserveMaterials(wo.id); if (!r) throw new Error('Nothing to reserve: every item is reserved, at the site or used.'); return r; }, r => `${r.srId}: reservation sent to the supply chain platform`);
  const setQty = (l: T.MaterialLine, quantity: number) => run(() => ops.updateLine(l.id, { quantity }), approved ? `Quantity changed to ${quantity}; marked as changed after approval` : `Quantity changed to ${quantity}`);
  const setDisp = (l: T.MaterialLine, d: T.RetiredDisposition, dataBearing = l.dataBearing) => run(() => ops.setDisposition(l.id, d, { dataBearing }), `${l.description}: ${d.toLowerCase()}`);
  const applyBulk = () => {
    if (!bulk) return;
    let n = 0;
    run(() => { for (const id of selected) { const l = outLines.find(x => x.id === id); if (l) { ops.setDisposition(l.id, bulk, { dataBearing: l.dataBearing }); n++; } } }, () => `${n} item${n === 1 ? '' : 's'}: ${bulk.toLowerCase()}`);
    setSelected([]); setBulk(undefined);
  };

  const devicesOf = (l: T.MaterialLine) => (l.installedDeviceIds?.length ? l.installedDeviceIds : l.deviceIds ?? []).map(id => devices.get(id)).filter((x): x is T.Device => !!x);
  const whereOf = (l: T.MaterialLine): ReactNode => {
    const ds = devicesOf(l);
    const placed = ds.filter(x => x.rackId).map(x => `${racks.get(x.rackId!)?.name ?? x.rackId}${x.position ? ` U${x.position}` : ''}`);
    if (placed.length) return placed.length > 2 ? `${placed.slice(0, 2).join(', ')} and ${placed.length - 2} more` : placed.join(', ');
    const removed = events.filter(e => e.materialLineId === l.id && e.kind === 'Removed' && e.note).map(e => e.note!.replace(/^From /, ''));
    return removed.length ? <TwoLine main={removed.slice(0, 2).join(', ')} sub={removed.length > 2 ? `and ${removed.length - 2} more` : 'when removed'} /> : <Muted>—</Muted>;
  };
  // A disposition can change until the item is under a disposal certificate (after a return is booked, the platform is told separately).
  const dispEditable = (l: T.MaterialLine) => l.status !== 'Cancelled' && !l.disposalCertificateId;
  const selectable = outLines.filter(dispEditable);

  return (
    <div className="col" style={{ gap: 16 }} id="materials">
      <SummaryTiles items={summaryItems(inLines, kit, avail, retired, cost)} />

      {(warnings.length > 0 || afterApproval.length > 0) && (
        <div className={`note ${avail.short.length ? 'note--bad' : warnings.length ? 'note--warn' : 'note--info'}`}>
          {avail.short.length || warnings.length ? <AlertTriangle size={15} /> : <Info size={15} />}
          <div className="col" style={{ gap: 4 }}>
            {warnings.length > 0 && <span>To look at: {warnings.join('; ')}. Advisory: it does not block approval or the start of work.</span>}
            {afterApproval.length > 0 && <span>{afterApproval.length} item{afterApproval.length === 1 ? ' was' : 's were'} added or changed after the change was approved: {afterApproval.slice(0, 4).map(l => l.description).join(', ')}{afterApproval.length > 4 ? ' and more' : ''}. The change manager sees this in the review.</span>}
          </div>
        </div>
      )}

      {where === 'workOrder' ? (
        <Panel title="On site" icon={Truck} sub="the crew's material steps">
          <div className="vw-flex vw-flex-col vw-gap-md">
            <div className="vw-flex vw-justify-between vw-items-start vw-gap-md vw-wrap">
              <div style={{ minWidth: 0, flex: 1 }}>
                <Muted>Check the kit against the list when it arrives, record the serials and quantities when the work is done, then send back what was not used or was found faulty, and the removed equipment.</Muted>
              </div>
              <div className="vw-flex vw-gap-sm vw-wrap">
                {canConfirm && <Btn variant="filled" onClick={() => setAsk('confirm')}>Confirm kit received</Btn>}
                {canRecord && <Btn variant="filled" onClick={() => setAsk('record')}>Record materials</Btn>}
                {canReturn && <Btn variant="filled" onClick={() => setAsk('return')}>Return parts</Btn>}
                {!canConfirm && !canRecord && !canReturn && <Muted>{recordedNote(wo, lines.length, returns.length > 0)}</Muted>}
              </div>
            </div>
            <Recorded wo={wo} usage={usage} />
          </div>
        </Panel>
      ) : (
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <Recorded wo={wo} usage={usage} link={`/delivery/work-orders/${wo.id}?tab=execution`} />
          <Muted>The crew confirms the kit, records serials and quantities and returns parts on <Link to={`/delivery/work-orders/${wo.id}?tab=execution`}>work order {wo.woId ?? wo.id}</Link> (Execution tab). Everything else can be managed here or there: both pages edit the same lines.</Muted>
        </div>
      )}

      {/* ---------------------------------------------------------------- required */}
      <Panel title="Required materials" icon={PackagePlus} sub={inLines.length ? `${inLines.length} item${inLines.length === 1 ? '' : 's'} going in${lastChecked ? ` · availability checked ${fmtDateTime(lastChecked)}` : ''}` : 'none'}>
        <div className="vw-flex vw-flex-col vw-gap-md">
          <div className="vw-flex vw-justify-between vw-items-start vw-gap-md vw-wrap">
            <div style={{ minWidth: 0, flex: 1 }} className="vw-flex vw-flex-col vw-gap-xs">
              {inLines.length > 0 && (
                <span className="vw-inline-flex vw-items-center vw-gap-sm vw-wrap">
                  <Chip tone={AVAILABILITY_TONE[avail.state]} dot>{avail.state === 'Not checked' ? 'Availability not checked' : avail.state}</Chip>
                  <ReadinessChip r={kit} />
                  {avail.readyBy && avail.open > 0 && <Muted>everything at the site by {fmtDay(avail.readyBy)}</Muted>}
                </span>
              )}
              {avail.reasons.length > 0 && <Muted>{avail.reasons.join(' · ')}{avail.reserved ? ` · ${avail.reserved} reserved` : ''}.</Muted>}
              {kit.reasons.length > 0 && <Muted>Kit: {kit.reasons.join('; ')}.</Muted>}
            </div>
            {open && (
              <div className="vw-flex vw-gap-sm vw-wrap">
                {canCheck && <Btn variant={avail.state === 'Not checked' ? 'filled' : 'outline'} onClick={check}>Check availability</Btn>}
                {canReserve && <Btn onClick={reserve}>Reserve</Btn>}
                {needKit && <Btn variant={avail.state !== 'Not checked' ? 'filled' : 'outline'} onClick={requestKit}>Request kit</Btn>}
                <Btn onClick={() => setAsk('add-in')}>Add item</Btn>
              </div>
            )}
          </div>
          <DataTable<T.MaterialLine> rows={inLines} rowKey={l => l.id}
            empty="Nothing goes in for this work. Lines come from the project step's bill of materials, the standard template's kit or the default kit for the kind of work. Add an item if the work needs something."
            cols={[
              { key: 'i', title: 'Item', wrap: true, minWidth: 200, render: l => (
                <div className="vw-flex vw-flex-col" style={{ gap: 2 }}>
                  <TwoLine main={l.description} sub={[mats.get(l.materialId)?.partNumber, l.kind === 'Serialised' ? 'serialised' : 'consumable', l.notes].filter(Boolean).join(' · ')} />
                  {l.changedAfterApproval && <span><Chip tone="warning">Changed after approval</Chip></span>}
                </div>
              ) },
              { key: 'q', title: 'Quantity', render: l => (
                <div className="vw-flex vw-flex-col" style={{ gap: 2 }}>
                  {lineEditable(l, open) ? <QtyInput key={`${l.id}-${l.quantity}`} line={l} approved={approved} onSave={q => setQty(l, q)} /> : <span>{fmtQty(l.quantity, l.uom)}</span>}
                  {usedText(l) && <Muted size="xs">{usedText(l)}</Muted>}
                </div>
              ) },
              { key: 'src', title: 'Source', render: l => SOURCE_LABEL[l.source] },
              { key: 'a', title: 'Availability', wrap: true, minWidth: 180, render: l => <AvailabilityCell l={l} /> },
              { key: 'r', title: 'Reserved', align: 'right', render: l => (l.reservedQty ? <span style={{ color: l.reservedQty < l.quantity ? 'var(--vw-color-amber-700)' : undefined }}>{l.reservedQty} of {l.quantity}</span> : <Muted>—</Muted>) },
              { key: 's', title: 'Kit status', render: l => <Chip tone={LINE_STATUS_TONE[l.status]} dot>{l.status}</Chip> },
              { key: 'n', title: 'Need by · supplier date', render: l => <TwoLine main={<span style={{ color: lineLate(l) ? 'var(--vw-color-red-600)' : undefined }}>{fmtDay(l.needBy)}</span>} sub={l.eta && !reached(l, 'Received') ? <span style={{ color: supplierLate(l) ? 'var(--vw-color-red-600)' : undefined }}>supplier {fmtDay(l.eta)}</span> : undefined} /> },
              { key: 'sn', title: 'Serials', wrap: true, minWidth: 140, render: l => serialsCell(l, devices) },
              { key: 'x', title: '', align: 'right', render: l => (lineEditable(l, open) && !isUsed(l) ? <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => setRemoving(l)} aria-label={`Remove ${l.description}`}>Remove</button> : null) },
            ]} />
          {cost.priced > 0 && <Muted size="xs">Estimated material cost {fmtMoney(cost.total)} at catalogue prices{cost.unpriced ? ` (${cost.unpriced} item${cost.unpriced === 1 ? '' : 's'} without a price)` : ''}. The supply chain platform owns the stock; availability is its answer at the time of the check.</Muted>}
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- retired */}
      <Panel title="Retired equipment" icon={PackageMinus} sub={retired.units ? `${retired.units} unit${retired.units === 1 ? '' : 's'} coming out` : 'none'}>
        <div className="vw-flex vw-flex-col vw-gap-md">
          <div className="vw-flex vw-justify-between vw-items-start vw-gap-md vw-wrap">
            <div style={{ minWidth: 0, flex: 1 }} className="vw-flex vw-flex-col vw-gap-xs">
              {retired.units > 0 ? (
                <span className="vw-inline-flex vw-items-center vw-gap-xs vw-wrap">
                  {(Object.entries(retired.byDisposition) as [T.RetiredDisposition | 'Not decided', number][]).filter(([, n]) => n > 0).map(([k, n]) => <Chip key={k} tone={DISPOSITION_TONE[k]}>{n} {k.toLowerCase()}</Chip>)}
                  {retired.dataBearing > 0 && <Muted>{retired.dataBearing} data-bearing</Muted>}
                </span>
              ) : <Muted>Equipment removed by this work: decide where each item goes (back to stock, redeployed, back to the vendor or disposed) and record the sanitisation of anything that holds data.</Muted>}
            </div>
            {open && (
              <div className="vw-flex vw-gap-sm vw-wrap">
                <Btn variant={outLines.length ? 'outline' : 'filled'} onClick={() => setAsk('retire')}>Add equipment to retire</Btn>
                <Btn onClick={() => setAsk('add-out')}>Add other item</Btn>
              </div>
            )}
          </div>
          {retired.awaitingSanitisation.length > 0 && (
            <div className="note note--warn">
              <AlertTriangle size={15} />
              <span>{retired.awaitingSanitisation.length} data-bearing item{retired.awaitingSanitisation.length === 1 ? ' has' : 's have'} no sanitisation certificate yet: {retired.awaitingSanitisation.slice(0, 4).map(l => devicesOf(l)[0]?.name ?? l.description).join(', ')}{retired.awaitingSanitisation.length > 4 ? ' and more' : ''}. Record the wipe or destruction before the item leaves the site.</span>
            </div>
          )}
          {selectable.length > 1 && (
            <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
              <Checkbox checked={selected.length === selectable.length} indeterminate={selected.length > 0 && selected.length < selectable.length}
                onChange={e => setSelected(e.target.checked ? selectable.map(l => l.id) : [])}>
                <Muted>{selected.length ? `${selected.length} selected` : 'Select all'}</Muted>
              </Checkbox>
              <Select size="small" value={bulk} onChange={setBulk} placeholder="Set disposition" style={{ width: 220 }} options={DISPOSITIONS.map(x => ({ value: x, label: x }))} aria-label="Disposition for the selected items" disabled={!selected.length} />
              <button type="button" className="nst-btn nst-btn--sm" disabled={!selected.length || !bulk} onClick={applyBulk}>Apply to selected</button>
            </div>
          )}
          <DataTable<T.MaterialLine> rows={outLines} rowKey={l => l.id}
            empty="Nothing comes out of the estate with this work. Add the equipment to retire if the work removes any."
            cols={[
              ...(selectable.length > 1 ? [{ key: 'sel', title: '', width: 32, render: (l: T.MaterialLine) => dispEditable(l) ? <Checkbox checked={selected.includes(l.id)} onChange={e => setSelected(s => e.target.checked ? [...s, l.id] : s.filter(x => x !== l.id))} aria-label={`Select ${l.description}`} /> : null }] : []),
              { key: 'e', title: 'Equipment', wrap: true, minWidth: 200, render: l => equipmentCell(l, devicesOf(l), mats.get(l.materialId)) },
              { key: 'w', title: 'Rack and U', render: whereOf },
              { key: 'd', title: 'Disposition', render: l => (dispEditable(l) ? (
                <Select size="small" value={l.disposition} placeholder="Not decided" style={{ width: 200 }} onChange={(x: T.RetiredDisposition) => setDisp(l, x)} options={DISPOSITIONS.map(x => ({ value: x, label: x }))} aria-label={`Disposition: ${l.description}`} />
              ) : <Chip tone={DISPOSITION_TONE[l.disposition ?? 'Not decided']} dot>{l.disposition ?? 'Not decided'}</Chip>) },
              { key: 'db', title: 'Holds data', render: l => (
                <Tooltip title={!l.disposition && dispEditable(l) ? 'Choose the disposition first' : undefined}>
                  <span><Checkbox checked={!!l.dataBearing} disabled={!dispEditable(l) || !l.disposition} onChange={e => l.disposition && setDisp(l, l.disposition, e.target.checked)} aria-label={`Holds data: ${l.description}`}>{l.dataBearing ? 'Yes' : 'No'}</Checkbox></span>
                </Tooltip>
              ) },
              { key: 'san', title: 'Sanitisation', wrap: true, minWidth: 180, render: l => sanitisationCell(l, () => setSanitising(l)) },
              { key: 'st', title: 'Status', wrap: true, minWidth: 160, render: l => { const s = retiredStatus(l, reqs, l.disposalCertificateId ? certs.get(l.disposalCertificateId) : undefined); return <div className="vw-flex vw-flex-col" style={{ gap: 2 }}><span><Chip tone={s.tone} dot>{s.label}</Chip></span>{s.sub && <Muted size="xs">{s.sub}</Muted>}</div>; } },
              { key: 'x', title: '', align: 'right', render: l => (open && l.status === 'Planned' ? <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => setRemoving(l)} aria-label={`Remove ${l.description}`}>Remove</button> : null) },
            ]} />
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- consumption */}
      <ConsumptionCard lines={lines} wo={wo} materials={mats} />

      {/* ---------------------------------------------------------------- requests and history */}
      <Panel title="Requests to the supply chain platform" icon={ArrowLeftRight} sub={reqs.length ? `${reqs.length} sent` : 'none sent'}>
        <div className="vw-flex vw-flex-col vw-gap-md">
          <Muted>The supply chain platform holds the stock, reserves it, kits the items and delivers them to the site, and takes back unused, faulty and removed parts. These requests need no change request of their own; the work is covered by change {change?.chgId ?? change?.id ?? '(none)'}.</Muted>
          <DataTable<T.SupplyRequest> rows={reqs} rowKey={r => r.id}
            empty={inLines.length || outLines.length ? 'No request sent yet. Reserve the items or request the kit once they are in stock or ordered.' : 'Nothing to request.'}
            cols={[
              { key: 'id', title: 'Request', render: r => <TwoLine main={r.srId} sub={SR_KIND_LABEL[r.kind]} /> },
              { key: 's', title: 'Status', render: r => <Chip tone={SR_TONE[r.status]} dot>{srStatusLabel(r.kind, r.status)}</Chip> },
              { key: 'sent', title: 'Sent', render: r => <TwoLine main={fmtDateTime(r.sentAt)} sub={r.sentBy} /> },
              { key: 'to', title: 'Where and when', wrap: true, minWidth: 150, render: r => <TwoLine main={r.deliverTo ?? '—'} sub={[r.needBy && `need by ${fmtDay(r.needBy)}`, r.eta && `expected ${fmtDay(r.eta)}`].filter(Boolean).join(' · ') || undefined} /> },
              { key: 'n', title: 'Items', align: 'right', render: r => r.materialLineIds.length },
              { key: 'h', title: 'History', wrap: true, minWidth: 240, render: r => <HistoryCell r={r} /> },
            ]} />
          {sim.length > 0 && (
            <div className="vw-card-child-shaded vw-flex vw-flex-col vw-gap-xs" style={{ padding: 'var(--vw-space-sm) var(--vw-space-md)', border: '1px dashed var(--vw-color-slate-300)' }}>
              <Muted>Prototype: simulate the supply chain platform. In production these updates come from the platform.</Muted>
              <div className="vw-flex vw-gap-sm vw-wrap">
                {sim.map(r => { const nx = nextSrStatus(r)!; return (
                  <button key={r.id} type="button" className="nst-btn nst-btn--sm"
                    onClick={() => run(() => ops.simulateSupplyProgress(r.id, nx), `${r.srId}: ${srStatusLabel(r.kind, nx).toLowerCase()} (simulated)`)}>
                    {r.srId}: mark {srStatusLabel(r.kind, nx).toLowerCase()}
                  </button>
                ); })}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Material history" icon={History} actions={<button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => setHistory(x => !x)} aria-expanded={history}>{history ? 'Hide' : `Show ${events.length} event${events.length === 1 ? '' : 's'}`}</button>}>
        {history ? (
          <DataTable<T.MaterialEvent> rows={[...events].reverse()} rowKey={e => e.id} empty="Nothing has happened to these materials yet."
            cols={[
              { key: 'at', title: 'When', render: e => fmtDateTime(e.at) },
              { key: 'k', title: 'What', render: e => e.kind },
              { key: 'i', title: 'Item', wrap: true, minWidth: 160, render: e => lines.find(l => l.id === e.materialLineId)?.description ?? mats.get(e.materialId)?.description ?? e.materialId },
              { key: 'q', title: 'Qty', align: 'right', render: e => e.quantity },
              { key: 'sn', title: 'Serial', render: e => e.serial ?? '—' },
              { key: 'src', title: 'From', render: e => e.source },
              { key: 'b', title: 'By', render: e => e.by },
              { key: 'n', title: 'Note', wrap: true, minWidth: 160, render: e => e.note ?? '—' },
            ]} />
        ) : <Muted>Every check, reservation, request, delivery, install, removal and return on these lines, newest first when shown.</Muted>}
      </Panel>

      {ask === 'confirm' && <ConfirmKitModal lines={inLines} onClose={() => setAsk(null)} onOk={notes => { if (run(() => ops.confirmKitReceived(wo.id, notes), notes.length ? 'Kit received; shortages and faults noted' : 'Kit received in full')) setAsk(null); }} />}
      {ask === 'record' && <RecordModal lines={lines} devices={devices} onClose={() => setAsk(null)} onOk={entries => { if (run(() => ops.recordUsage(wo.id, entries), 'Materials recorded')) setAsk(null); }} />}
      {ask === 'return' && <ReturnModal back={back} onClose={() => setAsk(null)} onOk={() => { if (run(() => ops.returnParts(wo.id), sent => (sent.length ? `${sent.map(r => `${r.srId} (${SR_KIND_LABEL[r.kind].toLowerCase()})`).join(', ')} sent to the supply chain platform` : 'Nothing to return'))) setAsk(null); }} />}
      {(ask === 'add-in' || ask === 'add-out') && <AddItemModal materials={md.materials} defaultDirection={ask === 'add-out' ? 'Out' : 'In'} onClose={() => setAsk(null)} onOk={input => { if (run(() => ops.addLine(wo.id, input), approved ? 'Item added; marked as added after approval' : 'Item added')) setAsk(null); }} />}
      {ask === 'retire' && <RetireDevicesModal siteId={siteId} rackIds={rackIds} exclude={new Set(outLines.flatMap(l => [...(l.deviceIds ?? []), ...(l.installedDeviceIds ?? [])]))} onClose={() => setAsk(null)}
        onOk={(ids, disposition) => { if (run(() => ops.addRetired(wo.id, ids, disposition), ls => `${ls.length} item${ls.length === 1 ? '' : 's'} added to retire`)) setAsk(null); }} />}
      {removing && <RemoveLineModal line={removing} onClose={() => setRemoving(null)} onOk={reason => { if (run(() => ops.cancelLine(removing.id, reason), `${removing.description} removed`)) setRemoving(null); }} />}
      {sanitising && <SanitisationModal line={sanitising} actor={ops.actor} deviceText={equipmentText(sanitising, devicesOf(sanitising))} onClose={() => setSanitising(null)}
        onOk={s => { if (run(() => ops.recordSanitisation(sanitising.id, s), `Sanitisation recorded (${s.certificateNo})`)) setSanitising(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ summary */
// Short words for the summary figures (the long labels live on the chips and in the reasons).
const AVAIL_SHORT: Record<AvailabilityView['state'], string> = { 'Not checked': 'Not checked', Available: 'Available', 'Available after transfer': 'Depot transfer', 'On order': 'On order', Short: 'Short' };
const KIT_SHORT: Record<ReadinessView['state'], string> = { 'Not needed': 'None needed', Ready: 'At site', 'Partly ready': 'Partly at site', 'Not ready': 'Not at site', Late: 'Late' };
function summaryItems(inLines: T.MaterialLine[], kit: ReadinessView, a: AvailabilityView, r: RetiredView, cost: { total: number; priced: number }): SummaryItem[] {
  const units = inLines.reduce((s, l) => s + l.quantity, 0);
  const atone: SummaryItem['tone'] = a.state === 'Short' ? 'bad' : a.state === 'On order' ? 'warn' : a.state === 'Available' && inLines.length ? 'ok' : undefined;
  return [
    { label: 'Required', value: `${inLines.length} item${inLines.length === 1 ? '' : 's'}`, sub: inLines.length ? `${units} unit${units === 1 ? '' : 's'} going in` : 'nothing goes in' },
    { label: 'Availability', value: !inLines.length ? '—' : a.open ? AVAIL_SHORT[a.state] : 'At site', tone: atone, sub: !a.open ? undefined : a.state === 'Not checked' ? `${a.open - a.checked} of ${a.open} not checked` : a.short.length ? `${a.short.length} short` : a.readyBy ? `all at the site by ${fmtDay(a.readyBy)}` : a.reasons[0] },
    { label: 'Kit', value: KIT_SHORT[kit.state], tone: kit.state === 'Late' ? 'bad' : kitNotReady(kit) ? 'warn' : kit.state === 'Ready' ? 'ok' : undefined, sub: kit.lines ? `${kit.atSite} of ${kit.lines} at the site` : undefined },
    { label: 'Retired', value: `${r.units} unit${r.units === 1 ? '' : 's'}`, tone: r.awaitingSanitisation.length ? 'warn' : undefined, sub: r.units ? (r.awaitingSanitisation.length ? `${r.awaitingSanitisation.length} awaiting sanitisation` : dispositionSummary(r)) : 'nothing removed' },
    { label: 'Estimated material cost', value: cost.priced ? fmtMoney(cost.total) : '—', sub: 'catalogue price × quantity' },
  ];
}

/** The summary figures as Operate stat tiles; a good or bad figure keeps its colour. */
function SummaryTiles({ items }: { items: SummaryItem[] }) {
  const color = (t: SummaryItem['tone']) => (t === 'bad' ? 'var(--vw-color-red-600)' : t === 'warn' ? 'var(--vw-color-amber-700)' : t === 'ok' ? 'var(--vw-color-green-700)' : undefined);
  return (
    <StatGrid cols={5}>
      {items.map(it => <StatTile key={it.label} label={it.label} value={<span style={{ color: color(it.tone) }}>{it.value}</span>} sub={it.sub} />)}
    </StatGrid>
  );
}

function recordedNote(wo: T.WorkOrder, n: number, returned: boolean): string {
  if (!n) return 'No materials on this work order.';
  if (returned) return 'Materials recorded and the returns sent.';
  if (wo.materialsRecordedAt) return 'Materials recorded; nothing to send back.';
  if (['Draft', 'Awaiting change approval', 'Ready', 'Assigned'].includes(wo.status)) return 'The steps open when the kit is on its way and when the work is done.';
  return 'Nothing to do yet.';
}

function Recorded({ wo, usage, link }: { wo: T.WorkOrder; usage: ReturnType<typeof usageOf>; link?: string }) {
  if (wo.materialsRecordedAt) {
    return (
      <KvList columns={2} items={[
        { label: 'Recorded', value: `${fmtDateTime(wo.materialsRecordedAt)}${wo.materialsRecordedBy ? ` by ${wo.materialsRecordedBy}` : ''}` },
        { label: 'Used of planned', value: `${usage.used} of ${usage.planned}` },
        { label: 'Returned', value: usage.returned },
        { label: 'Found faulty', value: usage.faulty },
      ]} />
    );
  }
  if (!usage.notRecorded) return null;
  return <div className="note note--warn"><AlertTriangle size={15} /><span>The work is finished but the materials were not recorded. Record what was installed, used and left over so the estate and the stock stay right.{link && <> <Link to={link}>Record them on the work order</Link>.</>}</span></div>;
}

/* ------------------------------------------------------------------ cells */
function QtyInput({ line, approved, onSave }: { line: T.MaterialLine; approved: boolean; onSave: (q: number) => void }) {
  const [q, setQ] = useState<number>(line.quantity);
  const save = () => { if (q >= 1 && q !== line.quantity) onSave(q); else setQ(line.quantity); };
  return (
    <Tooltip title={approved ? 'The change is approved: a new quantity is marked as changed after approval. It does not reopen the approval.' : undefined}>
      <InputNumber size="small" min={1} value={q} onChange={x => setQ(Number(x) || 0)} onBlur={save} onPressEnter={save} style={{ width: 96 }}
        addonAfter={line.uom !== 'each' ? line.uom : undefined} aria-label={`Quantity: ${line.description}`} />
    </Tooltip>
  );
}

function AvailabilityCell({ l }: { l: T.MaterialLine }) {
  if (l.status === 'Returned') return <Muted>—</Muted>;
  if (reached(l, 'Delivered to site')) return <Muted>At the site</Muted>;
  const a = l.availability;
  if (!a) return <Muted>Not checked</Muted>;
  return (
    <div className="vw-flex vw-flex-col" style={{ gap: 2 }} title={`Checked ${fmtDateTime(a.checkedAt)}`}>
      <span className="vw-inline-flex vw-items-center vw-gap-xs vw-wrap"><Chip tone={SOURCE_TONE[a.bestSource]}>{a.bestSource}</Chip>{a.shortfall > 0 && <span style={{ color: 'var(--vw-color-red-600)', fontSize: 'var(--vw-font-label-sm)' }}>short {a.shortfall}</span>}</span>
      <Muted size="xs">{availabilityFigures(a)}{a.onOrder && a.onOrderEta ? ` (due ${fmtDay(a.onOrderEta)})` : ''}</Muted>
      {a.readyBy && <Muted size="xs">at the site by {fmtDay(a.readyBy)}</Muted>}
    </div>
  );
}

function usedText(l: T.MaterialLine): string | undefined {
  const q = l.qty; const parts = [q.used && `used ${q.used}`, q.returned && `returned ${q.returned}`, q.faulty && `faulty ${q.faulty}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}
function serialsCell(l: T.MaterialLine, devices: Map<string, T.Device>): ReactNode {
  if (l.kind !== 'Serialised') return <Muted>by quantity</Muted>;
  if (l.serials?.length) return l.serials.join(', ');
  const reserved = (l.deviceIds ?? []).map(id => devices.get(id)?.serial ?? devices.get(id)?.name ?? id);
  return reserved.length ? <Muted>reserved: {reserved.join(', ')}</Muted> : <Muted>not captured yet</Muted>;
}
function equipmentText(l: T.MaterialLine, ds: T.Device[]): string {
  if (ds.length === 1) return [ds[0].name, ds[0].serial && `serial ${ds[0].serial}`, ds[0].model ?? l.description].filter(Boolean).join(', ');
  return `${l.description} × ${l.quantity}`;
}
function equipmentCell(l: T.MaterialLine, ds: T.Device[], m?: T.Material): ReactNode {
  if (ds.length === 1) return <TwoLine main={ds[0].name} sub={[ds[0].serial ? `SN ${ds[0].serial}` : l.serials?.[0] ? `SN ${l.serials[0]}` : '', ds[0].model ?? l.description].filter(Boolean).join(' · ')} />;
  if (ds.length > 1) return <TwoLine main={`${l.description} × ${l.quantity}`} sub={`${ds.slice(0, 3).map(x => x.name).join(', ')}${ds.length > 3 ? ` and ${ds.length - 3} more` : ''}`} />;
  return <TwoLine main={l.description} sub={[m?.partNumber, l.serials?.length ? `SN ${l.serials.join(', ')}` : fmtQty(l.quantity, l.uom)].filter(Boolean).join(' · ')} />;
}
function sanitisationCell(l: T.MaterialLine, onRecord: () => void): ReactNode {
  if (!l.dataBearing) return <Muted>Not needed</Muted>;
  const s = l.sanitisation;
  const btn = l.status !== 'Cancelled' ? <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={onRecord}>{s?.certificateNo ? 'Edit' : 'Record'}</button> : null;
  if (!s?.certificateNo) return <span className="vw-inline-flex vw-items-center vw-gap-xs vw-wrap"><Chip tone="warning" dot>Awaiting</Chip>{btn}</span>;
  return (
    <div className="vw-flex vw-items-start vw-gap-xs">
      <TwoLine main={s.certificateNo} sub={[s.method, s.by, s.witness && `witness ${s.witness}`, s.at && fmtDay(s.at)].filter(Boolean).join(' · ')} />
      {btn}
    </div>
  );
}
function HistoryCell({ r }: { r: T.SupplyRequest }) {
  const h = [...r.history].sort((a, b) => a.at.localeCompare(b.at));
  if (!h.length) return <Muted>—</Muted>;
  return (
    <div className="vw-flex vw-flex-col" style={{ gap: 2 }}>
      {h.map((x, i) => <Muted key={i} size="xs">{fmtDateTime(x.at)}: {srStatusLabel(r.kind, x.status)}{x.note ? `, ${x.note}` : ''}</Muted>)}
      {r.kind === 'RMA' && r.serials?.length ? <Muted size="xs">Serials {r.serials.join(', ')}{r.reason ? `: ${r.reason}` : ''}</Muted> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ spares and consumption */
/** Planned against used for the items going in, with the spares and the differences. */
export function ConsumptionCard({ lines, wo, materials }: { lines: T.MaterialLine[]; wo: T.WorkOrder; materials: Map<string, T.Material> }) {
  const u = usageOf(lines, wo);
  const inc = lines.filter(l => l.direction === 'In');
  const spares = inc.filter(l => materials.get(l.materialId)?.category === 'Spares');
  return (
    <Panel title="Spares and consumption" icon={PackageOpen} sub={wo.materialsRecordedAt ? `recorded ${fmtDateTime(wo.materialsRecordedAt)}` : 'not recorded yet'}>
      {!inc.length ? <div className="vw-card-description">Nothing goes in, so there is nothing to consume.</div> : (
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <KvList columns={3} items={[
            { label: 'Planned', value: u.planned },
            { label: 'Used', value: wo.materialsRecordedAt ? u.used : '—' },
            { label: 'Left over', value: u.returned },
            { label: 'Found faulty', value: u.faulty },
            { label: 'Spares', value: spares.length ? `${spares.reduce((a, l) => a + l.qty.used, 0)} used of ${spares.reduce((a, l) => a + l.quantity, 0)} (${spares.length} line${spares.length === 1 ? '' : 's'})` : 'none planned' },
            { label: 'Differences', value: u.variances.length ? <span style={{ color: 'var(--vw-color-amber-700)' }}>{u.variances.length} item{u.variances.length === 1 ? '' : 's'}</span> : wo.materialsRecordedAt ? 'none' : '—' },
          ]} />
          {u.variances.length > 0 && (
            <DataTable<{ line: T.MaterialLine; diff: number }> rows={u.variances} rowKey={x => x.line.id}
              cols={[
                { key: 'i', title: 'Item', wrap: true, minWidth: 180, render: x => x.line.description },
                { key: 'p', title: 'Planned', align: 'right', render: x => fmtQty(x.line.quantity, x.line.uom) },
                { key: 'u', title: 'Used', align: 'right', render: x => fmtQty(x.line.qty.used, x.line.uom) },
                { key: 'd', title: 'Difference', align: 'right', render: x => <span style={{ color: x.diff > 0 ? 'var(--vw-color-amber-700)' : undefined }}>{x.diff > 0 ? `+${x.diff}` : x.diff}</span> },
                { key: 'r', title: 'Left over / faulty', render: x => `${x.line.qty.returned} / ${x.line.qty.faulty}` },
              ]} />
          )}
        </div>
      )}
    </Panel>
  );
}
