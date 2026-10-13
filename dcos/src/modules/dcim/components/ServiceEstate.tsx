/* Service footprint and customer tenancy blocks for the operations cockpit screens (data: lib/serviceFacts). */
import { Link } from 'react-router-dom';
import type { TenantRacks } from '../../facility/lib/estateRules';
import { clusterHref, fmtMoney } from '../lib/estateView';
import { usePlaceNames, useServiceFacts } from '../lib/serviceFacts';

const kw = (n: number) => `${Math.round(n * 10) / 10} kW`;
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Footprint of one service: start date, billing currency, racks and GPU nodes. Rendered inside an ops Panel. */
export function ServiceFootprint({ serviceId, revenueMonthly }: { serviceId: string; revenueMonthly: number }) {
  const facts = useServiceFacts().get(serviceId);
  const names = usePlaceNames();
  if (!facts) return <span className="muted">No inventory record for this service.</span>;
  const byModel = new Map<string, number>();
  for (const d of facts.gpuNodes) byModel.set(d.gpu!.model, (byModel.get(d.gpu!.model) ?? 0) + d.gpu!.count);
  const clusters = [...new Set(facts.gpuNodes.map((d) => d.gpu?.clusterId).filter((x): x is string => !!x))];
  return (
    <div className="col" style={{ gap: 12 }}>
      <dl className="kv" style={{ '--cols': 4 } as React.CSSProperties}>
        <div className="kv-item"><dt>Started</dt><dd>{fmtDay(facts.startDate)}</dd></div>
        <div className="kv-item"><dt>Billed in</dt><dd>{facts.currency}</dd></div>
        <div className="kv-item"><dt>Revenue / month</dt><dd className="num">{fmtMoney(revenueMonthly, facts.currency)}</dd></div>
        <div className="kv-item"><dt>GPU</dt><dd>{facts.gpuNodes.length ? `${facts.gpuNodes.length} node${facts.gpuNodes.length === 1 ? '' : 's'} · ${[...byModel].map(([m, n]) => `${n} × ${m}`).join(', ')}` : 'None'}</dd></div>
      </dl>
      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Racks ({facts.rackIds.length})</div>
        {facts.rackIds.length ? (
          <div className="row wrap" style={{ gap: 8 }}>
            {facts.rackIds.map((id) => { const r = names.rack.get(id); return (
              <Link key={id} className="ent-link" to={`/facility/racks/${id}`}>{r?.name ?? id}{r ? <span className="faint"> · {names.site.get(r.dataCenterId) ?? r.dataCenterId}{r.hallId ? ` · ${names.hall.get(r.hallId) ?? ''}` : ''}</span> : null}</Link>
            ); })}
          </div>
        ) : <span className="faint">No rack recorded</span>}
      </div>
      {facts.gpuNodes.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>GPU nodes ({facts.gpuNodes.length}){clusters.length ? <> · cluster {clusters.map((c, i) => <span key={c}>{i ? ', ' : ''}<Link className="ent-link" to={clusterHref(c)}>{c}</Link></span>)}</> : null}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {facts.gpuNodes.slice(0, 40).map((d) => <Link key={d.id} className="ent-link mono" to={`/facility/devices/${d.id}`}>{d.name}</Link>)}
            {facts.gpuNodes.length > 40 && <span className="faint">+{facts.gpuNodes.length - 40} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Racks a customer leases, with contracted and drawn power. Rendered inside an ops Panel (flush). */
export function CustomerTenancyTable({ tenancy }: { tenancy?: TenantRacks }) {
  const names = usePlaceNames();
  if (!tenancy || !tenancy.racks.length) return <div className="muted" style={{ padding: '12px 16px' }}>This customer leases no racks.</div>;
  const rows = [...tenancy.racks].sort((a, b) => a.dataCenterId.localeCompare(b.dataCenterId) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return (
    <div className="nst-table-wrap"><table className="nst-table dt-table">
      <thead><tr><th>Rack</th><th>Site · room</th><th className="is-right">Contracted</th><th className="is-right">Drawing</th><th className="is-right">Rack budget</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => {
          const over = r.contractedKw != null && r.currentPowerKw > r.contractedKw;
          return (
            <tr key={r.id}>
              <td><Link className="ent-link" to={`/facility/racks/${r.id}`}>{r.name}</Link></td>
              <td>{names.site.get(r.dataCenterId) ?? r.dataCenterId}{r.hallId ? <span className="faint"> · {names.hall.get(r.hallId) ?? r.hallId}</span> : null}</td>
              <td className="is-right num">{r.contractedKw != null ? kw(r.contractedKw) : '—'}</td>
              <td className={`is-right num${over ? ' bad' : ''}`}>{kw(r.currentPowerKw || 0)}</td>
              <td className="is-right num">{kw(r.maxPowerKw)}</td>
              <td>{over ? <span className="vw-chip vw-chip--error">Over contract</span> : null}</td>
            </tr>
          );
        })}
        <tr className="row-total"><td>Total</td><td>{new Set(rows.map((r) => r.dataCenterId)).size} site(s)</td><td className="is-right num">{kw(tenancy.contractedKw)}</td><td className="is-right num">{kw(tenancy.drawKw)}</td><td className="is-right num">{kw(tenancy.maxKw)}</td><td /></tr>
      </tbody>
    </table></div>
  );
}
