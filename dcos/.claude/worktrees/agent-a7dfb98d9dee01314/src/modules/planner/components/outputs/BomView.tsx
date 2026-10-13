/* Bill of materials: where the items come from (site, stock, purchase), totals, category split, comparison with the CapEx estimate, and the line table. */
import { useMemo } from 'react';
import { Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, EmptyState, type VwChipVariant } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DownloadOutlined, WarningOutlined } from '../../../../shared/icons';
import { fmtUsd } from '../../lib/engine';
import { bomCsv, type Bom, type BomItem } from '../../lib/outputs';
import type { SourceKind, SourcedBom, SourcedLine } from '../../lib/sourcing';
import { Stat } from '../kit';
import { Muted } from '../detail/shared';
import { SOURCE_LABEL, SOURCE_SHORT, avoidedCost, contractByVendor, downloadText, sourcedAsBom, sourcedBomCsv, sourcingSplit, vendorOrders } from './packModel';

const ESTIMATE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'hall', 'portfolio'];
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const SOURCE_COLOR: Record<SourceKind, string> = { site: 'var(--vw-color-teal-500)', stock: 'var(--vw-color-blue-500)', procure: 'var(--vw-color-slate-300)' };
const SOURCE_TONE: Record<SourceKind, VwChipVariant> = { site: 'success', stock: 'info', procure: 'neutral' };
const num = { fontVariantNumeric: 'tabular-nums' } as const;
const dash = <span style={{ color: 'var(--vw-color-slate-400)' }}>—</span>;

/** A plain line, or a sourced line with its model, split and vendor. */
type Row = BomItem & Partial<SourcedLine>;

function Qty({ n }: { n?: number }) {
  return n ? <span style={num}>{n.toLocaleString('en-US')}</span> : dash;
}

function Allocations({ line }: { line: Row }) {
  return (
    <div className="vw-flex vw-flex-col vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-sm)', padding: '2px 0' }}>
      {line.substituted && <div style={{ color: 'var(--vw-color-amber-700)' }}>Preferred model not used: {line.substituted}.</div>}
      {(line.allocations ?? []).map((a, i) => (
        <div key={i} className="vw-flex vw-items-center vw-gap-sm" style={{ whiteSpace: 'normal' }}>
          <VwChip variant={SOURCE_TONE[a.source]}>{SOURCE_SHORT[a.source]} {a.qty.toLocaleString('en-US')}</VwChip>
          <span style={{ color: 'var(--vw-color-slate-700)' }}>{a.note}</span>
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
  const sum = Math.max(1, split.reduce((a, x) => a + x.value, 0));
  const avoided = avoidedCost(sourced);
  const orders = vendorOrders(sourced).length;
  return (
    <VwCard title="Where the items come from" extra={<Muted>{avoided ? `${fmtUsd(avoided)} of new spend avoided` : 'Everything is bought new'}</Muted>}>
      <div className="vw-flex" style={{ height: 10, borderRadius: 'var(--vw-radius-full)', overflow: 'hidden', background: 'var(--vw-color-slate-100)' }}>
        {split.filter(x => x.value > 0).map(x => <span key={x.source} title={`${SOURCE_LABEL[x.source]}: ${fmtUsd(x.value)}`} style={{ width: `${(x.value / sum) * 100}%`, background: SOURCE_COLOR[x.source] }} />)}
      </div>
      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginTop: 'var(--vw-space-sm)' }}>
        {split.map(x => (
          <div key={x.source} style={{ minWidth: 0 }}>
            <div className="vw-flex vw-items-center vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SOURCE_COLOR[x.source], flex: 'none' }} />{SOURCE_LABEL[x.source]}
            </div>
            <div style={{ ...num, fontSize: 18, fontWeight: 600, color: 'var(--vw-color-slate-900)' }}>{fmtUsd(x.value)}</div>
            <Muted size="xs">{x.lines ? `${x.lines} line${x.lines === 1 ? '' : 's'}` : 'none'}{x.source === 'procure' && orders ? ` · ${orders} vendor order${orders === 1 ? '' : 's'}` : ''}</Muted>
          </div>
        ))}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>Avoided cost</div>
          <div style={{ ...num, fontSize: 18, fontWeight: 600, color: avoided ? 'var(--vw-color-green-600)' : 'var(--vw-color-slate-900)' }}>{fmtUsd(avoided)}</div>
          <Muted size="xs">site capacity and stock at list price</Muted>
        </div>
      </div>
    </VwCard>
  );
}

function SourcingWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="vw-flex vw-gap-sm" style={{ padding: '8px 12px', border: '1px solid var(--vw-color-amber-200)', background: 'var(--vw-color-amber-25)', borderRadius: 'var(--vw-radius-md)', fontSize: 'var(--vw-font-label-sm)' }}>
      <span style={{ color: 'var(--vw-color-amber-600)' }}><WarningOutlined /></span>
      <div className="vw-flex vw-flex-col" style={{ gap: 2, minWidth: 0 }}>
        <strong style={{ color: 'var(--vw-color-slate-900)' }}>Sourcing notes ({warnings.length})</strong>
        {warnings.map(w => <span key={w} style={{ color: 'var(--vw-color-slate-700)' }}>{w}</span>)}
      </div>
    </div>
  );
}

export function BomView({ plan, bom: plain, sourced, capexTotal }: { plan: T.PlannerPlan; bom: Bom; sourced?: SourcedBom; capexTotal: number }) {
  const bom = useMemo(() => (sourced ? sourcedAsBom(plain, sourced) : plain), [plain, sourced]);
  const contract = useMemo(() => (sourced ? contractByVendor(sourced) : new Map<string, string>()), [sourced]);
  const max = Math.max(1, ...bom.byCategory.map(c => c.total));
  const longLead = bom.lines.filter(l => (l.leadWeeks ?? 0) >= 40).length;
  const comparison = ESTIMATE_SCOPES.includes(plan.scope)
    ? `The bill of materials covers ${bom.coveragePct}% of the plant and IT estimate (${fmtUsd(bom.capexCompared)}); land, shell and services are excluded.`
    : `This plan type is estimated bottom-up, so the bill of materials is the better figure. The CapEx estimate is ${fmtUsd(capexTotal)}.`;

  const columns: ColumnsType<Row> = useMemo(() => {
    const category = { title: 'Category', dataIndex: 'category', key: 'category', width: 140, filters: bom.byCategory.map(c => ({ text: c.category, value: c.category })), onFilter: (v: unknown, r: Row) => r.category === v };
    const item = { title: 'Item', dataIndex: 'item', key: 'item', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> };
    const spec = { title: 'Specification', dataIndex: 'spec', key: 'spec', width: 240, render: (t: string) => <span style={{ whiteSpace: 'normal', color: 'var(--vw-color-slate-600)' }}>{t}</span> };
    const qty = { title: 'Quantity', key: 'qty', align: 'right' as const, render: (_: unknown, r: Row) => <span style={num}>{r.qty.toLocaleString('en-US')} {r.unit}</span> };
    const unit = { title: 'Unit cost', dataIndex: 'unitCost', key: 'unit', align: 'right' as const, render: (n: number) => <span style={num}>{usd(n)}</span> };
    const total = { title: 'Total', dataIndex: 'total', key: 'total', align: 'right' as const, sorter: (a: Row, b: Row) => a.total - b.total, render: (n: number) => <span style={{ ...num, fontWeight: 500 }}>{usd(n)}</span> };
    const lead = { title: 'Lead time', dataIndex: 'leadWeeks', key: 'lead', align: 'right' as const, sorter: (a: Row, b: Row) => (a.leadWeeks ?? 0) - (b.leadWeeks ?? 0), render: (w?: number) => (w === undefined ? dash : <span style={{ color: w >= 40 ? 'var(--vw-color-red-600)' : undefined, fontWeight: w >= 40 ? 600 : undefined }}>{w} wk</span>) };
    const pn = { title: 'Part number', dataIndex: 'partNumber', key: 'pn', render: (t: string) => <span style={{ fontFamily: 'var(--vw-font-mono, monospace)', fontSize: 'var(--vw-font-label-xs)' }}>{t}</span> };
    const mfr = { title: 'Manufacturer', dataIndex: 'manufacturer', key: 'mfr' };
    if (!sourced) return [category, item, spec, qty, unit, total, lead, pn, mfr];

    const model = {
      title: 'Model', key: 'model', width: 190,
      render: (_: unknown, r: Row) => (r.model
        ? <span style={{ whiteSpace: 'normal' }}>{r.model} <Muted size="xs">{r.manufacturer}</Muted>{r.substituted && <Tooltip title={`Preferred model not used: ${r.substituted}`}><span style={{ marginLeft: 4 }}><VwChip variant="warning">Substitute</VwChip></span></Tooltip>}</span>
        : <Muted size="xs">{r.manufacturer}</Muted>),
    };
    const split = (key: 'fromSite' | 'fromStock' | 'toBuy', title: string) => ({ title, dataIndex: key, key, align: 'right' as const, sorter: (a: Row, b: Row) => (a[key] ?? 0) - (b[key] ?? 0), render: (n?: number) => <Qty n={n} /> });
    const vendor = {
      title: 'Vendor', key: 'vendor', width: 190,
      render: (_: unknown, r: Row) => {
        const buy = r.allocations?.find(a => a.source === 'procure');
        if (!buy) return <Muted size="xs">Nothing to buy</Muted>;
        const c = contract.get(buy.vendorName ?? '') ?? 'no contract';
        return <span style={{ whiteSpace: 'normal' }}>{buy.vendorName ?? 'To tender'} {c === 'no contract' ? <VwChip variant="warning">no contract</VwChip> : <Muted size="xs">{c}</Muted>}</span>;
      },
    };
    return [category, item, model, spec, qty, split('fromSite', 'From site'), split('fromStock', 'From stock'), split('toBuy', 'To buy'), unit, total, vendor, lead, pn];
  }, [bom.byCategory, sourced, contract]);

  if (!bom.lines.length) {
    return <VwCard><EmptyState title="No bill of materials" description="Nothing in this plan's sizing needs to be bought. Check the sizing and scope if that looks wrong." /></VwCard>;
  }

  const totalIdx = columns.findIndex(c => c.key === 'total');
  const lead = sourced ? 1 : 0; // the expand column
  const csv = () => downloadText(`${plan.plnId}-bom.csv`, sourced ? sourcedBomCsv(sourced) : bomCsv(bom), 'text/csv');

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {sourced && <SourcingSummary sourced={sourced} />}
      {sourced && <SourcingWarnings warnings={sourced.warnings} />}
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'minmax(150px, 1fr) minmax(150px, 1fr) minmax(0, 2.4fr)' }}>
        <Stat label="Total" value={fmtUsd(bom.total)} sub={ESTIMATE_SCOPES.includes(plan.scope) ? `${bom.coveragePct}% of plant and IT estimate` : `estimate ${fmtUsd(capexTotal)}`} />
        <Stat label="Lines" value={bom.lines.length} sub={longLead ? `${longLead} with 40+ week lead time` : 'no line over 40 weeks'} tone={longLead ? 'warn' : undefined} />
        <div className="vw-card-child" style={{ padding: '10px 14px', minWidth: 0 }}>
          <div className="vw-grid" style={{ gridTemplateColumns: 'minmax(110px, auto) minmax(0, 1fr) auto', columnGap: 8, rowGap: 3, alignItems: 'center', fontSize: 'var(--vw-font-label-xs)' }}>
            {bom.byCategory.map(c => (
              <div key={c.category} style={{ display: 'contents' }}>
                <span style={{ color: 'var(--vw-color-slate-600)', whiteSpace: 'nowrap' }}>{c.category}</span>
                <span style={{ height: 6, borderRadius: 3, background: 'var(--vw-color-slate-100)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(c.total / max) * 100}%`, background: 'var(--vw-color-blue-500)' }} /></span>
                <span style={{ ...num, textAlign: 'right', color: 'var(--vw-color-slate-900)' }}>{fmtUsd(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="vw-card-description">{comparison} Unit costs are indicative list prices until the items are tendered.{sourced ? ' Models come from the approved catalogue; expand a line to see where each quantity comes from.' : ''}</div>

      <VwCard title="Lines" extra={<Button size="small" icon={<DownloadOutlined />} onClick={csv}>Download CSV</Button>}>
        <Table<Row> size="small" rowKey="id" dataSource={bom.lines as Row[]} columns={columns} pagination={false} scroll={{ x: sourced ? 1700 : 1100 }}
          expandable={sourced ? { expandedRowRender: r => <Allocations line={r} />, rowExpandable: r => !!r.allocations?.length } : undefined}
          summary={rows => {
            const total = rows.reduce((a, r) => a + r.total, 0);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={totalIdx + lead}><strong>Total{rows.length !== bom.lines.length ? ' (filtered)' : ''}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={totalIdx + lead} align="right"><strong style={num}>{usd(total)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={totalIdx + lead + 1} colSpan={columns.length - totalIdx - 1} />
              </Table.Summary.Row>
            );
          }} />
      </VwCard>
    </div>
  );
}
