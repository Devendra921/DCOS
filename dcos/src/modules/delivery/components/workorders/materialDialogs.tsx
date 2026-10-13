/* The material dialogs shared by the change and the work order: confirm the kit, record materials,
   return parts, add an item, remove a line, record a sanitisation and add equipment to retire. Each
   hands its answer to the caller, which writes through useMaterialActions(). */
import { useMemo, useState } from 'react';
import { DatePicker, Input, InputNumber, Modal, Select, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type * as T from '../../../../mock/data/types';
import { VwSegmented } from '../../../../shared/components/ux';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import { fmtQty } from '../../lib/materialRules';
import type { UsageEntry } from '../../lib/materialOps';
import { DataTable, Muted } from '../home/kit';
import { DISPOSITIONS, SANITISATION_METHODS, retireOptions, type BackRow } from './materialsView';

const DIR_LABEL = { In: 'Going in', Out: 'Coming out' } as const;
const NONE: never[] = [];

/* ------------------------------------------------------------------ returns */
export function ReturnModal({ back, onClose, onOk }: { back: { stores: BackRow[]; rma: BackRow[] }; onClose: () => void; onOk: () => void }) {
  const cols = [
    { key: 'i', title: 'Item', wrap: true, minWidth: 180, render: (b: BackRow) => b.line.description },
    { key: 'q', title: 'Quantity', render: (b: BackRow) => fmtQty(b.qty, b.line.uom) },
    { key: 'w', title: 'Why', render: (b: BackRow) => b.why },
  ];
  return (
    <Modal open width={640} title="Return parts" onCancel={onClose} onOk={onOk} okText="Send the returns">
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-card-description">The supply chain platform collects these from the site. Unused and removed items go back to stores; faulty serialised items go back to the vendor under an RMA.</div>
        <div><div className="vw-card-title-sm" style={{ marginBottom: 4 }}>Back to stores</div><DataTable<BackRow> rows={back.stores} rowKey={b => `${b.line.id}-${b.why}`} cols={cols} empty="Nothing goes back to stores." /></div>
        <div><div className="vw-card-title-sm" style={{ marginBottom: 4 }}>To the vendor (RMA)</div><DataTable<BackRow> rows={back.rma} rowKey={b => `${b.line.id}-${b.why}`} cols={cols} empty="Nothing was found faulty." /></div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ confirm kit */
export function ConfirmKitModal({ lines, onClose, onOk }: { lines: T.MaterialLine[]; onClose: () => void; onOk: (notes: { materialLineId: string; short?: number; faulty?: number }[]) => void }) {
  const [notes, setNotes] = useState<Record<string, { short: number; faulty: number }>>({});
  const set = (id: string, p: Partial<{ short: number; faulty: number }>) => setNotes(n => ({ ...n, [id]: { ...(n[id] ?? { short: 0, faulty: 0 }), ...p } }));
  const out = Object.entries(notes).filter(([, x]) => x.short || x.faulty).map(([materialLineId, x]) => ({ materialLineId, short: x.short || undefined, faulty: x.faulty || undefined }));
  return (
    <Modal open width={680} title="Confirm kit received" onCancel={onClose} onOk={() => onOk(out)} okText={out.length ? 'Confirm with notes' : 'Confirm all received'}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">Check the kit against the material list. Note anything short or faulty on arrival; leave the rest at zero.</div>
        <DataTable<T.MaterialLine> rows={lines} rowKey={l => l.id}
          cols={[
            { key: 'i', title: 'Item', wrap: true, minWidth: 180, render: l => l.description },
            { key: 'q', title: 'Expected', render: l => fmtQty(l.quantity, l.uom) },
            { key: 's', title: 'Short', render: l => <InputNumber size="small" min={0} max={l.quantity} value={notes[l.id]?.short ?? 0} onChange={x => set(l.id, { short: Number(x) || 0 })} aria-label={`Short: ${l.description}`} /> },
            { key: 'f', title: 'Faulty', render: l => <InputNumber size="small" min={0} max={l.quantity} value={notes[l.id]?.faulty ?? 0} onChange={x => set(l.id, { faulty: Number(x) || 0 })} aria-label={`Faulty: ${l.description}`} /> },
          ]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ record materials */
interface Rec { serials: string[]; used: number; returned: number; faulty: number; faultySerials: string[]; reason: string }
function initialRec(l: T.MaterialLine, devices: Map<string, T.Device>): Rec {
  const known = (l.deviceIds ?? []).map(id => devices.get(id)?.serial).filter((s): s is string => !!s);
  if (l.direction === 'Out') return { serials: l.serials?.length ? l.serials : known, used: 0, returned: 0, faulty: 0, faultySerials: [], reason: '' };
  if (l.kind === 'Serialised') { const serials = (l.serials?.length ? l.serials : known).slice(0, l.quantity); return { serials, used: serials.length, returned: 0, faulty: 0, faultySerials: [], reason: '' }; }
  return { serials: [], used: l.quantity, returned: 0, faulty: 0, faultySerials: [], reason: '' };
}

export function RecordModal({ lines, devices, onClose, onOk }: { lines: T.MaterialLine[]; devices: Map<string, T.Device>; onClose: () => void; onOk: (entries: UsageEntry[]) => void }) {
  const [rec, setRec] = useState<Record<string, Rec>>(() => Object.fromEntries(lines.map(l => [l.id, initialRec(l, devices)])));
  const set = (id: string, p: Partial<Rec>) => setRec(r => ({ ...r, [id]: { ...r[id], ...p } }));
  const entries: UsageEntry[] = lines.map(l => {
    const r = rec[l.id];
    // Removed equipment: the serials taken out (the device records are retired); with none typed, the reserved devices.
    if (l.direction === 'Out') return { materialLineId: l.id, serials: r.serials.length ? r.serials : undefined, used: r.serials.length || undefined };
    if (l.kind === 'Serialised') return { materialLineId: l.id, serials: r.serials, used: r.serials.length, returned: r.returned || undefined, faulty: r.faultySerials.length || r.faulty || undefined, faultySerials: r.faultySerials.length ? r.faultySerials : undefined, faultReason: r.reason.trim() || undefined };
    return { materialLineId: l.id, used: r.used, returned: r.returned || undefined, faulty: r.faulty || undefined, faultReason: r.reason.trim() || undefined };
  });
  return (
    <Modal open width={760} title="Record materials" onCancel={onClose} onOk={() => onOk(entries)} okText="Record">
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ maxHeight: '64vh', overflowY: 'auto', paddingRight: 4 }}>
        <div className="vw-card-description">Say what was installed or used, what is left over and what was found faulty. Installed serials update the device records; removed serials retire theirs. Pick a reserved serial or type the one on the label.</div>
        {lines.map(l => {
          const r = rec[l.id]; const serialised = l.kind === 'Serialised';
          const options = [...new Set([...(l.deviceIds ?? []).map(id => devices.get(id)?.serial).filter((s): s is string => !!s), ...(l.serials ?? [])])].map(s => ({ value: s, label: s }));
          const used = serialised ? r.serials.length : r.used;
          const faulty = serialised ? (r.faultySerials.length || r.faulty) : r.faulty;
          const accounted = used + r.returned + faulty;
          return (
            <div key={l.id} className="vw-card-child-shaded vw-flex vw-flex-col vw-gap-sm" style={{ padding: 'var(--vw-space-sm) var(--vw-space-md)' }}>
              <div className="vw-flex vw-justify-between vw-items-baseline vw-gap-sm vw-wrap">
                <span style={{ color: 'var(--vw-color-slate-900)', fontWeight: 500 }}>{l.description}</span>
                <Muted>{DIR_LABEL[l.direction]} · {fmtQty(l.quantity, l.uom)} planned</Muted>
              </div>
              {l.direction === 'Out' ? (
                <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Serials removed</Muted>
                  <Select mode="tags" value={r.serials} onChange={s => set(l.id, { serials: s })} options={options} placeholder="Pick or type the serials taken out" aria-label={`Serials removed: ${l.description}`} />
                </label>
              ) : (
                <div className="vw-grid vw-gap-sm detail-form-grid" style={{ gridTemplateColumns: serialised ? 'minmax(0, 2fr) minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))' }}>
                  {serialised ? (
                    <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Serials installed ({r.serials.length})</Muted>
                      <Select mode="tags" value={r.serials} onChange={s => set(l.id, { serials: s, faultySerials: r.faultySerials.filter(x => !s.includes(x)) })} options={options} placeholder="Pick a reserved serial or type one" aria-label={`Serials installed: ${l.description}`} />
                    </label>
                  ) : (
                    <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Used</Muted><InputNumber min={0} value={r.used} onChange={x => set(l.id, { used: Number(x) || 0 })} style={{ width: '100%' }} aria-label={`Used: ${l.description}`} /></label>
                  )}
                  <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Left over (back to stores)</Muted><InputNumber min={0} value={r.returned} onChange={x => set(l.id, { returned: Number(x) || 0 })} style={{ width: '100%' }} aria-label={`Left over: ${l.description}`} /></label>
                  {serialised ? (
                    <label className="vw-flex vw-flex-col vw-gap-xs" style={{ gridColumn: '1 / -1' }}><Muted>Faulty serials (go back to the vendor)</Muted>
                      <Select mode="tags" value={r.faultySerials} onChange={s => set(l.id, { faultySerials: s })} options={options.filter(o => !r.serials.includes(o.value))} placeholder="Serials found faulty, if any" aria-label={`Faulty serials: ${l.description}`} />
                    </label>
                  ) : (
                    <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Faulty</Muted><InputNumber min={0} value={r.faulty} onChange={x => set(l.id, { faulty: Number(x) || 0 })} style={{ width: '100%' }} aria-label={`Faulty: ${l.description}`} /></label>
                  )}
                  {faulty > 0 && <label className="vw-flex vw-flex-col vw-gap-xs" style={{ gridColumn: '1 / -1' }}><Muted>What was wrong</Muted><Input value={r.reason} onChange={e => set(l.id, { reason: e.target.value })} placeholder="e.g. dead on arrival, bent rail" aria-label={`Fault: ${l.description}`} /></label>}
                </div>
              )}
              {l.direction === 'In' && accounted !== l.quantity && <Muted size="xs"><span style={{ color: 'var(--vw-color-amber-700)' }}>{accounted} of {l.quantity} accounted for.</span> The difference shows as a variance in the change review.</Muted>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ add item */
export function AddItemModal({ materials, onClose, onOk, defaultDirection = 'In' }: { materials: T.Material[]; defaultDirection?: 'In' | 'Out'; onClose: () => void; onOk: (input: { materialId: string; quantity: number; direction: 'In' | 'Out'; notes?: string }) => void }) {
  const [materialId, setMaterialId] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState<'In' | 'Out'>(defaultDirection);
  const [notes, setNotes] = useState('');
  const m = materials.find(x => x.id === materialId);
  return (
    <Modal open title="Add an item" onCancel={onClose} okText="Add item" okButtonProps={{ disabled: !materialId || quantity < 1 }}
      onOk={() => materialId && onOk({ materialId, quantity, direction, notes: notes.trim() || undefined })}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">Pick from the supply chain platform's catalogue. Items going in are kitted with the rest when the kit is requested.</div>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Item</Muted>
          <Select showSearch optionFilterProp="label" value={materialId} onChange={setMaterialId} placeholder={materials.length ? 'Search the catalogue' : 'The catalogue is empty'} aria-label="Catalogue item"
            options={materials.map(x => ({ value: x.id, label: `${x.partNumber} · ${x.description}` }))} />
        </label>
        {m && <Muted size="xs">{m.manufacturer} · {m.category} · {m.kind === 'Serialised' ? 'tracked by serial' : `by quantity (${m.uom})`}{m.leadWeeks ? ` · lead time ${m.leadWeeks} weeks` : ''}</Muted>}
        <div className="vw-grid vw-gap-sm detail-form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Quantity</Muted><InputNumber min={1} value={quantity} onChange={x => setQuantity(Number(x) || 1)} style={{ width: '100%' }} aria-label="Quantity" /></label>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Direction</Muted><VwSegmented value={direction} onChange={setDirection} options={[{ value: 'In', label: 'Going in' }, { value: 'Out', label: 'Coming out' }]} /></label>
        </div>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Note (optional)</Muted><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why it is needed" aria-label="Note" /></label>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ remove a line */
export function RemoveLineModal({ line, onClose, onOk }: { line: T.MaterialLine; onClose: () => void; onOk: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 3;
  return (
    <Modal open title={`Remove ${line.description}?`} onCancel={onClose} onOk={() => ok && onOk(reason.trim())} okText="Remove the line" okButtonProps={{ danger: true, disabled: !ok }}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">An item planned for the project step goes back to the step; anything else is cancelled. Either way it stays in the material history.</div>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Why it is no longer needed (required)</Muted><Input.TextArea rows={2} value={reason} onChange={e => setReason(e.target.value)} aria-label="Reason" /></label>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ sanitisation */
type Sanitisation = NonNullable<T.MaterialLine['sanitisation']>;
export function SanitisationModal({ line, deviceText, actor, onClose, onOk }: { line: T.MaterialLine; deviceText: string; actor: string; onClose: () => void; onOk: (s: Sanitisation) => void }) {
  const prev = line.sanitisation;
  const [method, setMethod] = useState<Sanitisation['method']>(prev?.method ?? 'Wipe (NIST 800-88 purge)');
  const [certificateNo, setCert] = useState(prev?.certificateNo ?? '');
  const [witness, setWitness] = useState(prev?.witness ?? '');
  const [by, setBy] = useState(prev?.by ?? actor);
  const [at, setAt] = useState<Dayjs>(prev?.at ? dayjs(prev.at) : dayjs());
  const ok = certificateNo.trim().length >= 2 && by.trim().length >= 2;
  return (
    <Modal open width={560} title="Record the sanitisation" onCancel={onClose} okText="Record sanitisation" okButtonProps={{ disabled: !ok }}
      onOk={() => ok && onOk({ method, certificateNo: certificateNo.trim(), witness: witness.trim() || undefined, by: by.trim(), at: at.toISOString() })}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">{deviceText}. A data-bearing item leaves the site only after its data is destroyed. Record how, the certificate number and who witnessed it.</div>
        <div className="vw-grid vw-gap-sm detail-form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Method</Muted><Select value={method} onChange={setMethod} options={SANITISATION_METHODS.map(m => ({ value: m, label: m }))} aria-label="Method" /></label>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Certificate number (required)</Muted><Input value={certificateNo} onChange={e => setCert(e.target.value)} placeholder="e.g. SAN-2026-0412" aria-label="Certificate number" /></label>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Done by</Muted><Input value={by} onChange={e => setBy(e.target.value)} aria-label="Done by" /></label>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Witness (optional)</Muted><Input value={witness} onChange={e => setWitness(e.target.value)} placeholder="Name of the witness" aria-label="Witness" /></label>
          <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>When</Muted><DatePicker showTime={{ format: 'HH:mm' }} format="D MMM YYYY HH:mm" value={at} onChange={x => x && setAt(x)} style={{ width: '100%' }} aria-label="When" /></label>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ equipment to retire */
/** Pick devices at the site (in the work's racks by default) to remove under this work order. */
export function RetireDevicesModal({ siteId, rackIds, exclude, onClose, onOk }: { siteId?: string; rackIds: string[]; exclude: Set<string>; onClose: () => void; onOk: (deviceIds: string[], disposition?: T.RetiredDisposition) => void }) {
  const [inScope, setInScope] = useState(rackIds.length > 0);
  const [ids, setIds] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<T.RetiredDisposition>();
  const filters = siteId ? [{ field: 'dataCenterId', operator: 'eq' as const, value: siteId }] : [];
  const devices = (useEntityList('devices', { pageSize: 20000, filters }).data?.data ?? NONE) as unknown as T.Device[];
  const racks = (useEntityList('racks', { pageSize: 5000, filters }).data?.data ?? NONE) as unknown as T.Rack[];
  const rackMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);
  const options = useMemo(() => retireOptions(devices, rackMap, siteId, inScope ? rackIds : [], exclude), [devices, rackMap, siteId, inScope, rackIds, exclude]);
  return (
    <Modal open width={640} title="Add equipment to retire" onCancel={onClose} okText={ids.length ? `Add ${ids.length} item${ids.length === 1 ? '' : 's'}` : 'Add'} okButtonProps={{ disabled: !ids.length }} onOk={() => ids.length && onOk(ids, disposition)}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <div className="vw-card-description">Each device becomes a line coming out of the estate. The crew records the serials when it is removed; the device record is retired then.</div>
        {rackIds.length > 0 && (
          <label className="vw-inline-flex vw-items-center vw-gap-sm"><Switch size="small" checked={inScope} onChange={setInScope} aria-label="Only the racks in this work" /><Muted>Only the {rackIds.length} rack{rackIds.length === 1 ? '' : 's'} in this work</Muted></label>
        )}
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Devices</Muted>
          <Select mode="multiple" showSearch optionFilterProp="label" value={ids} onChange={setIds} options={options} maxTagCount="responsive" aria-label="Devices to retire"
            placeholder={!siteId ? 'The work has no site' : options.length ? 'Search by name, serial, model or rack' : 'No device found in scope'} />
        </label>
        <label className="vw-flex vw-flex-col vw-gap-xs"><Muted>Disposition (optional: the default for the kind of work is used)</Muted>
          <Select allowClear value={disposition} onChange={setDisposition} placeholder="Decide later" options={DISPOSITIONS.map(x => ({ value: x, label: x }))} aria-label="Disposition" style={{ maxWidth: 280 }} />
        </label>
      </div>
    </Modal>
  );
}
