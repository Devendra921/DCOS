/* Materials on the change, read-only pieces for the other tabs: the Overview summary card, the
   approvers' advisory (kit, availability, retired equipment; never a block), and the review cards
   (planned against used, what happened to the retired equipment). The full workspace is the
   Materials tab (delivery/components/workorders/MaterialsWorkspace). Data: useChangeMaterials. */
import { Link } from 'react-router-dom';
import { Package, PackageCheck, Recycle } from 'lucide-react';
import type * as T from '../../../mock/data/types';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { DataTable } from '../../../ops/ui/DataTable';
import { AVAILABILITY_TONE, fmtQty, type AvailabilityView } from '../../delivery/lib/materialRules';
import { ReadinessChip } from '../../delivery/components/workorders/materials';
import { READINESS_LABEL, dispositionSummary, kitNotReady } from '../../delivery/components/workorders/materialsView';
import { fmtWhen } from '../lib/model';
import { KvList, Muted, Note } from './kit';
import type { ChangeMaterials } from '../lib/materials';

/** Overview card: a compact summary (required items and their availability, retired units by
    disposition, kit readiness) that opens the Materials tab. */
export function MaterialsCard({ m, onOpen }: { m: ChangeMaterials; onOpen?: () => void }) {
  const inc = m.lines.filter(l => l.direction === 'In');
  const a = m.availability, r = m.retired;
  const open = onOpen ? <Btn size="sm" variant="action" onClick={onOpen}>Open materials</Btn> : undefined;
  return (
    <Panel title="Materials" icon={Package} actions={open}>
      {!m.lines.length ? (
        <p className="vw-label" style={{ margin: 0 }}>No materials on this change. They come with its work order: the materials planned for the project step, the standard template's kit or the default kit for the work. Add items or equipment to retire on the Materials tab.</p>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <KvList columns={3} items={[
            { label: 'Required', value: inc.length ? (
              <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{inc.length} item{inc.length === 1 ? '' : 's'}{a.open > 0 && <AvailabilityChip a={a} />}{a.open > 0 && a.reasons.length > 0 && <Muted>{a.reasons.join(' · ')}</Muted>}</span>
            ) : 'Nothing goes in' },
            { label: 'Kit', value: m.kit.state === 'Not needed' ? <Muted>No kit needed</Muted> : <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><ReadinessChip r={m.kit} /><Muted>{m.kit.atSite} of {m.kit.lines} at the site</Muted></span> },
            { label: 'Retired', value: r.units ? (
              <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{r.units} unit{r.units === 1 ? '' : 's'}<Muted>{dispositionSummary(r)}</Muted>{r.awaitingSanitisation.length > 0 && <Chip tone="warning">{r.awaitingSanitisation.length} awaiting sanitisation</Chip>}</span>
            ) : 'Nothing removed' },
          ]} />
          {m.warnings.length > 0 && <Muted>To look at: {m.warnings.join('; ')}. Advisory: it does not block approval or the start of work.</Muted>}
        </div>
      )}
    </Panel>
  );
}

/** The availability chip ("Short", "On order", …). */
export function AvailabilityChip({ a, short }: { a: AvailabilityView; short?: boolean }) {
  return <Chip tone={AVAILABILITY_TONE[a.state]}>{a.state === 'Not checked' && !short ? 'Availability not checked' : a.state}</Chip>;
}

/**
 * Material warnings for approvers: the kit, whether the platform can supply the items, the retired
 * equipment and anything changed after approval. Advisory: it never blocks the decision.
 */
export function MaterialsAdvisory({ m, onOpen }: { m: ChangeMaterials; onOpen?: () => void }) {
  const a = m.availability, r = m.retired;
  const items: string[] = [];
  if (a.open > 0 && a.state !== 'Available') items.push(a.state === 'Not checked' ? `availability of ${a.open - a.checked} item${a.open - a.checked === 1 ? '' : 's'} not checked with the supply chain platform` : `availability: ${a.state.toLowerCase()} (${a.reasons.join(', ')})`);
  if (kitNotReady(m.kit)) items.push(`${READINESS_LABEL[m.kit.state].toLowerCase()} (${m.kit.reasons.join('; ')})`);
  if (r.units) items.push(`${r.units} unit${r.units === 1 ? '' : 's'} retired: ${dispositionSummary(r)}${r.awaitingSanitisation.length ? `, ${r.awaitingSanitisation.length} data-bearing awaiting sanitisation` : ''}`);
  if (m.changedAfterApproval.length) items.push(`${m.changedAfterApproval.length} item${m.changedAfterApproval.length === 1 ? '' : 's'} changed after approval`);
  if (!items.length) return null;
  const bad = a.short.length > 0 || m.kit.state === 'Late';
  const warn = bad || m.warnings.length > 0;
  return (
    <Note tone={bad ? 'bad' : warn ? 'warn' : 'info'}>
      Materials: {items.join('; ')}. Advisory: this does not block approval.{onOpen && <> <a onClick={onOpen}>Open materials</a>.</>}
    </Note>
  );
}

/** Review card: what happened to the retired equipment, and whether every data-bearing item was sanitised. */
export function RetiredOutcomeCard({ m }: { m: ChangeMaterials }) {
  const r = m.retired;
  if (!r.units) return null;
  const sanitised = r.dataBearing - r.awaitingSanitisation.reduce((a, l) => a + l.quantity, 0);
  const notRemoved = r.lines.filter(l => !l.qty.used && l.status !== 'Returned');
  return (
    <Panel title="Retired equipment: outcome" icon={Recycle} count={`${r.units} unit${r.units === 1 ? '' : 's'}`}>
      <div className="col" style={{ gap: 12 }}>
        {r.awaitingSanitisation.length > 0 && (
          <Note tone="warn">{r.awaitingSanitisation.length} data-bearing item{r.awaitingSanitisation.length === 1 ? ' has' : 's have'} no sanitisation certificate. Record it on the Materials tab, or say in the review why it is missing.</Note>
        )}
        <KvList columns={2} items={[
          { label: 'Removed', value: `${r.removed} of ${r.units}` },
          { label: 'Going back', value: r.returned },
          { label: 'Return to stock', value: r.byDisposition['Return to stock'] },
          { label: 'Redeployed', value: r.byDisposition.Redeploy },
          { label: 'Back to the vendor (RMA)', value: r.byDisposition['Return to vendor (RMA)'] },
          { label: 'Disposed', value: `${r.byDisposition.Dispose}${r.lines.some(l => l.disposalCertificateId) ? ' (certificate issued)' : ''}` },
          { label: 'Disposition not decided', value: r.byDisposition['Not decided'] ? <span style={{ color: 'var(--vw-color-amber-700)' }}>{r.byDisposition['Not decided']}</span> : 0 },
          { label: 'Sanitisation', value: r.dataBearing ? `${sanitised} of ${r.dataBearing} data-bearing unit${r.dataBearing === 1 ? '' : 's'} complete` : 'Nothing holds data' },
        ]} />
        {notRemoved.length > 0 && <Muted>{notRemoved.length} item{notRemoved.length === 1 ? ' was' : 's were'} not recorded as removed: {notRemoved.slice(0, 4).map(l => l.description).join(', ')}{notRemoved.length > 4 ? ' and more' : ''}.</Muted>}
      </div>
    </Panel>
  );
}

/** Review card: planned against used, with variances and a warning when nothing was recorded. */
export function UsageCard({ m, workOrder }: { m: ChangeMaterials; workOrder?: T.WorkOrder }) {
  const inc = m.lines.filter(l => l.direction === 'In');
  if (!m.lines.length) return null;
  const u = m.usage;
  return (
    <Panel title="Materials: planned and used" icon={PackageCheck} sub={workOrder?.materialsRecordedAt ? `recorded ${fmtWhen(workOrder.materialsRecordedAt)}` : undefined}>
      <div className="col" style={{ gap: 12 }}>
        {u.notRecorded && (
          <Note tone="warn">Materials not recorded: the work is finished but nobody recorded what was installed, used or left over. The device records and the stock may be wrong. {workOrder && <Link to={`/delivery/work-orders/${workOrder.id}?tab=execution`}>Record them on the work order</Link>}.</Note>
        )}
        <KvList columns={3} items={[
          { label: 'Planned', value: u.planned },
          { label: 'Used', value: u.used },
          { label: 'Returned', value: u.returned },
          { label: 'Found faulty', value: u.faulty },
          { label: 'Removed from the estate', value: m.lines.filter(l => l.direction === 'Out').reduce((a, l) => a + (l.installedDeviceIds?.length || l.serials?.length || l.qty.used), 0) },
          { label: 'Lines', value: `${inc.length} going in, ${m.lines.length - inc.length} coming out` },
        ]} />
        {u.variances.length > 0 ? (
          <DataTable compact rows={u.variances.map(x => ({ ...x, id: x.line.id }))} pageSize={50} cols={[
            { key: 'item', header: 'Item', wrap: true, render: ({ line }) => line.description },
            { key: 'plan', header: 'Planned', align: 'right', render: ({ line }) => <span className="num">{fmtQty(line.quantity, line.uom)}</span> },
            { key: 'used', header: 'Used', align: 'right', render: ({ line }) => <span className="num">{fmtQty(line.qty.used, line.uom)}</span> },
            { key: 'diff', header: 'Difference', align: 'right', render: ({ diff }) => <span className="num" style={{ color: diff > 0 ? 'var(--vw-color-amber-700)' : undefined }}>{diff > 0 ? `+${diff}` : diff}</span> },
            { key: 'ret', header: 'Returned / faulty', render: ({ line }) => <span className="num">{line.qty.returned} / {line.qty.faulty}</span> },
          ]} />
        ) : !u.notRecorded && workOrder?.materialsRecordedAt ? <Muted>Everything was used as planned.</Muted> : null}
      </div>
    </Panel>
  );
}
