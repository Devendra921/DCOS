/* Small material building blocks shared by the work order screens, the raise forms and the change
   screens: the readiness chip and note, the kit warning card, and the catalogue and retire pickers
   used when raising work. Readiness is advisory: nothing here blocks. Pure helpers are in materialsView.ts. */
import type { ReactNode } from 'react';
import { InputNumber, Select } from 'antd';
import type * as T from '../../../../mock/data/types';
import { AlertTriangle } from 'lucide-react';
import { Chip } from '../../../../ops/ui/kit';
import { READINESS_TONE, type ReadinessView } from '../../lib/materialRules';
import { DISPOSITIONS, READINESS_LABEL, kitNotReady, type PickedItem } from './materialsView';
import { Muted } from '../home/kit';

/** The readiness chip. `short` keeps the bare state for tables. */
export function ReadinessChip({ r, short }: { r: ReadinessView; short?: boolean }) {
  return <Chip tone={READINESS_TONE[r.state]} dot>{short ? r.state : READINESS_LABEL[r.state]}</Chip>;
}

/** Chip and plain reasons, with the advisory wording. Renders nothing when no kit is needed and `quiet`. */
export function ReadinessNote({ r, advisory = 'Advisory only: it does not block approval or the start of work.', quiet }: { r: ReadinessView; advisory?: ReactNode; quiet?: boolean }) {
  if (r.state === 'Not needed') return quiet ? null : <Muted>No kit needed: nothing goes in for this work.</Muted>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      <span className="vw-inline-flex vw-items-center vw-gap-sm vw-wrap"><ReadinessChip r={r} /><Muted>{r.atSite} of {r.lines} item{r.lines === 1 ? '' : 's'} at the site</Muted></span>
      {r.reasons.length > 0 && <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)' }}>{r.reasons.join('; ')}.</div>}
      {kitNotReady(r) && <Muted size="xs">{advisory}</Muted>}
    </div>
  );
}

/** A warning note for approvers and for the start of work, or nothing when the kit is at the site. */
export function KitWarning({ r, who }: { r: ReadinessView; who: 'approval' | 'start' }) {
  if (!kitNotReady(r)) return null;
  return (
    <div className={`note ${r.state === 'Late' ? 'note--bad' : 'note--warn'}`}>
      <AlertTriangle size={15} />
      <span>Materials: {READINESS_LABEL[r.state].toLowerCase()} ({r.reasons.join('; ')}). {who === 'approval' ? 'Advisory: this does not block approval.' : 'Advisory: the work can still start.'}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ catalogue picker */
/** A short list of catalogue items with quantities, for raising work with extra materials. */
export function MaterialPicker({ value, onChange, materials }: { value: PickedItem[]; onChange: (v: PickedItem[]) => void; materials: T.Material[] }) {
  const options = materials.map(m => ({ value: m.id, label: `${m.partNumber} · ${m.description}` }));
  const set = (i: number, p: Partial<PickedItem>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const byId = new Map(materials.map(m => [m.id, m]));
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs">
      {value.map((x, i) => (
        <div key={i} className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) 110px auto', alignItems: 'center' }}>
          <Select showSearch optionFilterProp="label" placeholder={materials.length ? 'Select a catalogue item' : 'The catalogue is empty'} value={x.materialId} onChange={id => set(i, { materialId: id })} options={options} aria-label={`Item ${i + 1}`} />
          <InputNumber min={1} value={x.quantity} onChange={q => set(i, { quantity: Number(q) || 1 })} aria-label={`Quantity of item ${i + 1}`} style={{ width: '100%' }}
            addonAfter={x.materialId && byId.get(x.materialId)?.uom !== 'each' ? byId.get(x.materialId)?.uom : undefined} />
          <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div><button type="button" className="nst-btn nst-btn--sm" disabled={!materials.length} onClick={() => onChange([...value, { quantity: 1 }])}>Add item</button></div>
    </div>
  );
}

/* ------------------------------------------------------------------ equipment to retire */
/** Devices the work removes from the estate, with an optional disposition, for the raise forms. */
export function RetirePicker({ value, onChange, options, disposition, onDisposition, disabledText }: {
  value: string[]; onChange: (ids: string[]) => void; options: { value: string; label: string }[];
  disposition?: T.RetiredDisposition; onDisposition: (d?: T.RetiredDisposition) => void; disabledText?: string;
}) {
  return (
    <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(0, 1fr) 220px', alignItems: 'start' }}>
      <Select mode="multiple" allowClear showSearch optionFilterProp="label" value={value} onChange={onChange} options={options} maxTagCount="responsive" disabled={!!disabledText}
        placeholder={disabledText ?? (options.length ? 'Search by name, serial, model or rack' : 'No device in scope')} aria-label="Equipment to retire" />
      <Select allowClear value={disposition} onChange={onDisposition} placeholder="Disposition: decide later" disabled={!value.length} aria-label="Disposition of the equipment to retire"
        options={DISPOSITIONS.map(x => ({ value: x, label: x }))} />
    </div>
  );
}
