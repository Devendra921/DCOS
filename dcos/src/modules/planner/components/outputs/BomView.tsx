/* Bill of materials: where the items come from (site, stock, purchase), totals, category split, comparison with the CapEx estimate, and the line table. */
import { useMemo, useState } from 'react';
import { Tooltip } from 'antd';
import { AlertTriangle, ChevronDown, ChevronRight, Download, ListOrdered, PackageSearch, Truck } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Btn, Chip, Empty, Panel, Seg, Stat } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { SOFT, SoftMeter, Split, type Tone } from '../../../../ops/ui/Analytics';
import { fmtUsd } from '../../lib/engine';
import { bomCsv, type Bom, type BomItem } from '../../lib/outputs';
import type { SourceKind, SourcedBom, SourcedLine } from '../../lib/sourcing';
import { Muted, ToneValue } from '../detail/shared';
import { SOURCE_LABEL, SOURCE_SHORT, avoidedCost, contractByVendor, downloadText, sourcedAsBom, sourcedBomCsv, sourcingSplit, vendorOrders } from './packModel';

const ESTIMATE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'hall', 'portfolio'];
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const SOURCE_TONE: Record<SourceKind, Tone> = { site: 'success', stock: 'info', procure: 'neutral' };
const dash = <span className="vw-label">—</span>;

/** A plain line, or a sourced line with its model, split and vendor. */
type Row = BomItem & Partial<SourcedLine>;

function Qty({ n }: { n?: number }) {
  return n ? <span className="num">{n.toLocaleString('en-US')}</span> : dash;
}

function Allocations({ line }: { line: Row }) {
  return (
    <div className="col" style={{ gap: 4, marginTop: 6, whiteSpace: 'normal' }}>
      {line.substituted && <div className="note note--warn" style={{ padding: '4px 8px' }}>Preferred model not used: {line.substituted}.</div>}
      {(line.allocations ?? []).map((a, i) => (
        <div key={i} className="row wrap" style={{ gap: 6 }}>
          <Chip tone={SOURCE_TONE[a.source]} size="xs" dot>{SOURCE_SHORT[a.source]} {a.qty.toLocaleString('en-US')}</Chip>
          <span>{a.note}</span>
          {a.source === 'procure' && <Muted size="xs">{usd(a.unitCost)} each{a.leadWeeks ? ` · ${a.leadWeeks} weeks lead` : ''}</Muted>}
          {a.source === 'stock' && a.deviceIds && <Muted size="xs">{a.deviceIds.length} device{a.deviceIds.length === 1 ? '' : 's'} reserved on execution</Muted>}
          {a.source === 'site' && a.rackIds && <Muted size="xs">{a.rackIds.slice(0, 6).join(', ')}{a.rackIds.length > 6 ? ` and ${a.rackIds.length - 6} more` : ''}</Muted>}
        </div>
      ))}
    </div>
  );
}

function SourcingSummary({ sourced }: { sourced: SourcedBom }) {
  const split = sourcingSplit(sourced);
  const avoided = avoidedCost(sourced);
  const orders = vendorOrders(sourced).length;
  return (
    <Panel icon={PackageSearch} title="Where the items come from" actions={<Muted>{avoided ? `${fmtUsd(avoided)} of new spend avoided` : 'Everything is bought new'}</Muted>}>
      <Split legend={false} parts={split.map(x => ({ key: x.source, label: SOURCE_LABEL[x.source], n: x.value, tone: SOURCE_TONE[x.source] }))} />
      <div className="grid g-4" style={{ marginTop: 12 }}>
        {split.map(x => (
          <div key={x.source} className="col" style={{ gap: 2 }}>
            <span className="vw-label row" style={{ gap: 6, fontSize: 12 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: SOFT[SOURCE_TONE[x.source]], flex: 'none' }} />{SOURCE_LABEL[x.source]}</span>
            <span className="num strong" style={{ fontSize: 18 }}>{fmtUsd(x.value)}</span>
            <Muted size="xs">{x.lines ? `${x.lines} line${x.lines === 1 ? '' : 's'}` : 'none'}{x.source === 'procure' && orders ? ` · ${orders} vendor order${orders === 1 ? '' : 's'}` : ''}</Muted>
          </div>
        ))}
        <div className="col" style={{ gap: 2 }}>
          <span className="vw-label" style={{ fontSize: 12 }}>Avoided cost</span>
          <span className="num strong" style={{ fontSize: 18 }}><ToneValue tone={avoided ? 'ok' : undefined}>{fmtUsd(avoided)}</ToneValue></span>
          <Muted size="xs">site capacity and stock at list price</Muted>
        </div>
      </div>
    </Panel>
  );
}

function SourcingWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="note note--warn">
      <AlertTriangle size={16} style={{ flex: 'none' }} />
      <div className="col" style={{ gap: 2, minWidth: 0 }}>
        <strong>Sourcing notes ({warnings.length})</strong>
        {warnings.map(w => <span key={w}>{w}</span>)}
      </div>
    </div>
  );
}

export function BomView({ plan, bom: plain, sourced, capexTotal }: { plan: T.PlannerPlan; bom: Bom; sourced?: SourcedBom; capexTotal: number }) {
  const bom = useMemo(() => (sourced ? sourcedAsBom(plain, sourced) : plain), [plain, sourced]);
  const contract = useMemo(() => (sourced ? contractByVendor(sourced) : new Map<string, string>()), [sourced]);
  const [category, setCategory] = useState<string>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const max = Math.max(1, ...bom.byCategory.map(c => c.total));
  const longLead = bom.lines.filter(l => (l.leadWeeks ?? 0) >= 40).length;
  const comparison = ESTIMATE_SCOPES.includes(plan.scope)
    ? `The bill of materials covers ${bom.coveragePct}% of the plant and IT estimate (${fmtUsd(bom.capexCompared)}); land, shell and services are excluded.`
    : `This plan type is estimated bottom-up, so the bill of materials is the better figure. The CapEx estimate is ${fmtUsd(capexTotal)}.`;

  const columns: Col<Row>[] = useMemo(() => {
    const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const expand: Col<Row> = { key: 'expand', header: '', width: 32, render: r => (r.allocations?.length
      ? <button type="button" className="nst-icon-btn" aria-label={open.has(r.id) ? 'Hide sourcing' : 'Show sourcing'} aria-expanded={open.has(r.id)} onClick={() => toggle(r.id)}>{open.has(r.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
      : null) };
    const cat: Col<Row> = { key: 'category', header: 'Category', render: r => r.category };
    const item: Col<Row> = { key: 'item', header: 'Item', wrap: !!sourced, render: r => <span className="col" style={{ gap: 0 }}><span className="strong">{r.item}</span>{sourced && open.has(r.id) && <Allocations line={r} />}</span> };
    const spec: Col<Row> = { key: 'spec', header: 'Specification', wrap: true, render: r => <span className="cell-2"><span className="vw-label">{r.spec}</span>{r.note && <small style={{ color: 'var(--vw-color-teal-700)' }}>{r.note}</small>}</span> };
    const qty: Col<Row> = { key: 'qty', header: 'Quantity', align: 'right', render: r => <span className="num">{r.qty.toLocaleString('en-US')} {r.unit}</span> };
    const unit: Col<Row> = { key: 'unit', header: 'Unit cost', align: 'right', render: r => <span className="num">{usd(r.unitCost)}</span> };
    const total: Col<Row> = { key: 'total', header: 'Total', align: 'right', sort: r => r.total, render: r => (r.monthly ? <Tooltip title="Service charge billed monthly; not part of the CapEx total"><span className="num vw-label">{usd(r.total)} a month</span></Tooltip> : <span className="num strong">{usd(r.total)}</span>) };
    const lead: Col<Row> = { key: 'lead', header: 'Lead time', align: 'right', sort: r => r.leadWeeks ?? 0, render: r => (r.leadWeeks === undefined ? dash : <span className="num" style={r.leadWeeks >= 40 ? { color: 'var(--vw-color-red-600)', fontWeight: 600 } : undefined}>{r.leadWeeks} wk</span>) };
    const pn: Col<Row> = { key: 'pn', header: 'Part number', render: r => <span className="mono" style={{ fontSize: 12 }}>{r.partNumber}</span> };
    const mfr: Col<Row> = { key: 'mfr', header: 'Manufacturer', render: r => r.manufacturer };
    if (!sourced) return [cat, item, spec, qty, unit, total, lead, pn, mfr];

    const model: Col<Row> = {
      key: 'model', header: 'Model', wrap: true,
      render: r => (r.model
        ? <span className="cell-2"><span>{r.model}{r.substituted && <Tooltip title={`Preferred model not used: ${r.substituted}`}><span style={{ marginLeft: 4 }}><Chip tone="warning" size="xs">Substitute</Chip></span></Tooltip>}</span><small>{r.manufacturer}</small></span>
        : <Muted size="xs">{r.manufacturer}</Muted>),
    };
    const split = (key: 'fromSite' | 'fromStock' | 'toBuy', header: string): Col<Row> => ({ key, header, align: 'right', sort: r => r[key] ?? 0, render: r => <Qty n={r[key]} /> });
    const vendor: Col<Row> = {
      key: 'vendor', header: 'Vendor', wrap: true,
      render: r => {
        const buy = r.allocations?.find(a => a.source === 'procure');
        if (!buy) return <Muted size="xs">Nothing to buy</Muted>;
        const c = contract.get(buy.vendorName ?? '') ?? 'no contract';
        return <span className="cell-2"><span>{buy.vendorName ?? 'To tender'}</span>{c === 'no contract' ? <span><Chip tone="warning" size="xs">no contract</Chip></span> : <small>{c}</small>}</span>;
      },
    };
    return [expand, cat, item, model, spec, qty, split('fromSite', 'From site'), split('fromStock', 'From stock'), split('toBuy', 'To buy'), unit, total, vendor, lead, pn];
  }, [sourced, contract, open]);

  const rows = useMemo(() => (category === 'all' ? bom.lines : bom.lines.filter(l => l.category === category)) as Row[], [bom.lines, category]);

  if (!bom.lines.length) {
    return <Panel><Empty icon={ListOrdered} title="No bill of materials">Nothing in this plan's sizing needs to be bought. Check the sizing and scope if that looks wrong.</Empty></Panel>;
  }

  const filteredTotal = rows.filter(r => !r.monthly).reduce((a, r) => a + r.total, 0);
  const csv = () => downloadText(`${plan.plnId}-bom.csv`, sourced ? sourcedBomCsv(sourced) : bomCsv(bom), 'text/csv');

  return (
    <div className="col" style={{ gap: 16 }}>
      {sourced && <SourcingSummary sourced={sourced} />}
      {sourced && <SourcingWarnings warnings={sourced.warnings} />}
      <div className="grid g-1-2">
        <Panel>
          <div className="grid g-2">
            <Stat label="Total" value={fmtUsd(bom.total)} sub={ESTIMATE_SCOPES.includes(plan.scope) ? `${bom.coveragePct}% of plant and IT estimate` : `estimate ${fmtUsd(capexTotal)}`} />
            <Stat label="Lines" value={<ToneValue tone={longLead ? 'warn' : undefined}>{bom.lines.length}</ToneValue>}
              sub={[longLead ? `${longLead} with 40+ week lead time` : 'no line over 40 weeks', plain.monthlyTotal ? `plus ${fmtUsd(plain.monthlyTotal)} a month in services` : ''].filter(Boolean).join(' · ')} />
          </div>
        </Panel>
        <Panel icon={Truck} title="By category">
          <div className="grid" style={{ gridTemplateColumns: 'minmax(110px, auto) minmax(0, 1fr) auto', gap: '4px 10px', alignItems: 'center', fontSize: 12 }}>
            {bom.byCategory.map(c => (
              <div key={c.category} style={{ display: 'contents' }}>
                <span className="vw-label" style={{ whiteSpace: 'nowrap' }}>{c.category}</span>
                <SoftMeter pct={(c.total / max) * 100} />
                <span className="num strong" style={{ textAlign: 'right' }}>{fmtUsd(c.total)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="note note--info"><div>{comparison} Unit costs are indicative list prices until the items are tendered.{sourced ? ' Models come from the approved catalogue; expand a line to see where each quantity comes from.' : ''}</div></div>

      <Panel flush icon={ListOrdered} title="Lines" count={rows.length} actions={<Btn size="xs" icon={Download} onClick={csv}>Download CSV</Btn>}
        foot={<div className="row between"><Muted>Total{rows.length !== bom.lines.length ? ' (filtered)' : ''}</Muted><span className="num strong">{usd(filteredTotal)}</span></div>}>
        <DataTable<Row> rows={rows} cols={columns} pageSize={1000}
          toolbar={bom.byCategory.length > 1 ? <Seg<string> size="sm" value={category} onChange={setCategory} options={[{ id: 'all', label: 'All categories' }, ...bom.byCategory.map(c => ({ id: c.category as string, label: c.category as string }))]} /> : undefined} />
      </Panel>
    </div>
  );
}
