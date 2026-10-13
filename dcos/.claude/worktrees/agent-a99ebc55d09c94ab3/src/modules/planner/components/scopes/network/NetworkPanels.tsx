/* Network uplift wizard panels and plan views: both ends and existing circuits, the DCI paths table with end-port
   pickers and the demand chart, the fabric uplift, and the dated cut-over schedule. */
import { useMemo } from 'react';
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { VwChip, VwSegmented } from '../../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined } from '../../../../../shared/icons';
import type * as T from '../../../../../mock/data/types';
import { useVwPalette } from '../../../../site360/lib/siteModel';
import { fmtUsd } from '../../../lib/engine';
import { DISPOSITION_OF, LINK_TYPES, NETWORK_KINDS, freePorts, networkKindOf, type ExistingCircuit, type NetworkAnalysis } from '../../../lib/networkModel';
import { networkOf } from '../../../lib/scopes/network';
import { Stat } from '../../kit';
import { ParamGrid, SubTitle, Field } from '../../wizard/ParamField';
import { climateFromHint, fmtDay, fromDateInput, paramDefsFor, toDateInput, type StepProps } from '../../wizard/wizardModel';
import type { PlanViewProps } from '../types';

const gb = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} Tbps` : `${Math.round(g * 10) / 10} Gbps`);
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;
const ACTION_LABEL = { keep: 'Keep', upgrade: 'Upgrade', cease: 'Cease', undecided: 'Not decided' } as const;
const nextId = (ids: string[]) => { let n = ids.length + 1; while (ids.includes(`PATH-${n}`)) n++; return `PATH-${n}`; };

/** Requirements: DCI between two sites or a fabric uplift in one; the ends and the circuits between them. */
export function NetworkSitePicker(props: StepProps) {
  const { draft, patch, data, ev } = props;
  const an = networkOf(ev); const kind = networkKindOf(draft);
  const sites = data.dataCenters.filter(d => d.status !== 'Retired').sort((a, b) => a.code.localeCompare(b.code));
  const opts = sites.map(d => ({ value: d.id, label: `${d.code} · ${d.name}` }));
  const pickA = (id: string) => { const dc = data.dataCenters.find(d => d.id === id); const campus = data.campuses.find(c => c.id === dc?.campusId); patch({ dataCenterId: id, campusId: dc?.campusId, regionId: campus?.regionId ?? draft.regionId, dcTypeKey: dc?.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(campus?.city) ?? draft.climate, newSiteName: undefined }); };
  const setKind = (v: string) => patch({ params: { ...draft.params, networkKind: v }, paramSources: { ...draft.paramSources, networkKind: 'user' }, peerDataCenterId: v.startsWith('Fabric') ? undefined : draft.peerDataCenterId });
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <VwSegmented size="small" value={String(draft.params.networkKind ?? NETWORK_KINDS[0])} options={NETWORK_KINDS.map(k => ({ value: k, label: k }))} onChange={setKind} />
      {kind === 'dci' ? (<>
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>An interconnect joins two live sites. Both ends are carried through the paths, the bill (optics, ports, cross-connects per end), the addresses and the circuits created.</div>
        <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="A end"><Select showSearch optionFilterProp="label" value={draft.dataCenterId} placeholder="Pick a site" options={opts.filter(o => o.value !== draft.peerDataCenterId)} onChange={pickA} /></Field>
          <Field label="Z end"><Select showSearch optionFilterProp="label" value={draft.peerDataCenterId} placeholder="Pick a site" options={opts.filter(o => o.value !== draft.dataCenterId)} onChange={v => patch({ peerDataCenterId: v })} /></Field>
        </div>
        {an && (an.a.dc || an.z.dc) && <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>{[an.a, an.z].map(e => <EndCard key={e.side} an={an} side={e.side} />)}</div>}
        {an?.ready && <ExistingCircuits {...props} an={an} />}
      </>) : (<>
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>A fabric uplift raises leaf-to-spine capacity inside one site. The current leaves and spines are read from the devices.</div>
        <Field label="Site"><Select showSearch optionFilterProp="label" value={draft.dataCenterId} placeholder="Pick a site" options={opts} onChange={pickA} style={{ maxWidth: 420 }} /></Field>
      </>)}
    </div>
  );
}

function EndCard({ an, side }: { an: NetworkAnalysis; side: 'A' | 'Z' }) {
  const e = side === 'A' ? an.a : an.z;
  if (!e.dc) return <div className="vw-card-child" style={{ padding: '10px 14px' }}><span className="vw-card-description">{side} end not set</span></div>;
  return (
    <div className="vw-card-child" style={{ padding: '10px 14px' }}>
      <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap"><b>{side} · {e.dc.code}</b><span className="vw-flex vw-gap-xs">{e.colo && <VwChip variant="info">Colocation: cross-connects</VwChip>}<VwChip variant={e.transitPools.length ? 'neutral' : 'error'}>{e.transitPools[0] ? `Transit ${e.transitPools[0].cidr}` : 'No transit pool'}</VwChip></span></div>
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{e.dc.name} · routers {e.routers.slice(0, 3).map(r => `${r.name} (${r.model ?? '—'})`).join(', ') || 'none recorded'}</div>
    </div>
  );
}

/** Existing A–Z circuits and what the plan does with each (keep / upgrade / cease). */
function ExistingCircuits({ draft, patch, an }: StepProps & { an: NetworkAnalysis }) {
  const setAction = (c: ExistingCircuit, v: 'keep' | 'upgrade' | 'cease') => {
    const rows = (draft.dispositions ?? []).filter(d => !(d.recordType === 'circuit' && d.recordId === c.circuit.id));
    patch({ dispositions: [...rows, { recordType: 'circuit', recordId: c.circuit.id, label: c.circuit.cid, disposition: DISPOSITION_OF[v] }] });
  };
  return (<>
    <SubTitle>Circuits between the sites today</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Circuit</th><th>Carrier</th><th style={{ textAlign: 'right' }}>Capacity</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Monthly</th><th>Contract end</th><th>Diversity group</th><th>Plan</th><th>Early termination</th></tr></thead>
      <tbody>{an.circuits.map(c => (
        <tr key={c.circuit.id}>
          <td>{c.circuit.cid}{!c.farEndKnown && <VwChip variant="warning" style={{ marginLeft: 6, fontSize: 10 }}>Far end not recorded</VwChip>}</td>
          <td>{c.provider?.name ?? '—'}</td><td style={{ textAlign: 'right' }}>{gb(c.capacityGbps)}</td>
          <td style={{ textAlign: 'right' }}>{c.measuredGbps !== undefined ? `${gb(c.measuredGbps)} (${c.utilisationPct}%)` : '—'}</td>
          <td style={{ textAlign: 'right' }}>{fmtUsd(c.monthlyUsd)}</td><td>{c.contractEnd ? fmtDay(c.contractEnd) : '—'}</td><td>{c.circuit.diversityGroup ?? '—'}</td>
          <td><Select size="small" value={c.action === 'undecided' ? undefined : c.action} placeholder="Decide" style={{ width: 110 }} options={(['keep', 'upgrade', 'cease'] as const).map(v => ({ value: v, label: ACTION_LABEL[v] }))} onChange={v => setAction(c, v)} /></td>
          <td style={{ whiteSpace: 'normal', fontSize: 12, minWidth: 220 }}>{c.etcUsd ? <VwChip variant="warning">{fmtUsd(c.etcUsd)}</VwChip> : null} {c.etcNote}</td>
        </tr>
      ))}
        {!an.circuits.length && <tr><td colSpan={9} style={{ color: 'var(--vw-color-slate-500)' }}>No circuits recorded between {an.a.dc?.code} and {an.z.dc?.code}.</td></tr>}</tbody>
    </table></div>
  </>);
}

/** Demand now and at the sizing year against the capacity planned (one measure, one axis). */
function DemandChart({ an }: { an: NetworkAnalysis }) {
  const p = useVwPalette(); const d = an.demand; if (!d) return null;
  const rows: [string, number, string][] = [['Services over A–Z, now', d.servicesGbps, `${d.services.length} services`], [`Services at year ${d.years}`, d.servicesAtN, 'each at its own growth'], ['Measured on today’s circuits', d.measuredGbps, 'interface utilisation'], [`Measured at year ${d.years}`, d.measuredAtN, `${d.growthPct}% a year`], ['Design figure', d.designGbps, d.overridden ? 'entered, overrides the derived need' : 'derived'], ['Capacity planned', an.capacityGbps + an.keptGbps, `${an.paths.length} new path(s)${an.keptGbps ? ' + kept' : ''}`]];
  const max = Math.max(1, ...rows.map(r => r[1])); const W = 640, LX = 200, BH = 16, GAP = 10, H = rows.length * (BH + GAP) + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: H * 1.3 }} role="img" aria-label="Demand and capacity in Gbps">
      {rows.map(([label, v, note], i) => { const y = 4 + i * (BH + GAP); const w = Math.max(2, ((W - LX - 110) * v) / max); const cap = i === rows.length - 1; return (
        <g key={label}><title>{`${label}: ${gb(v)} (${note})`}</title>
          <text x={LX - 8} y={y + 12} fontSize={11} textAnchor="end" fill={p.ink}>{label}</text>
          <rect x={LX} y={y} width={w} height={BH} rx={4} fill={cap ? p.slateDark : p.blue} />
          <text x={LX + w + 6} y={y + 12} fontSize={11} fill={p.slate}>{gb(v)}</text>
        </g>
      ); })}
    </svg>
  );
}

/** Network step for DCI: inputs, demand, paths with end-port pickers, and the checks' figures. */
export function NetworkPanel(props: StepProps) {
  const { draft, patch, ev, templates, data, setParam, resetParam } = props;
  const an = networkOf(ev); const kind = networkKindOf(draft);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  if (kind === 'fabric') return <FabricPanel {...props} />;
  if (!an?.ready) return <div className="vw-card-description">{an?.reason ?? 'Pick both ends in Requirements.'}</div>;
  const paths = draft.paths ?? [];
  const set = (id: string, p: Partial<T.PlannerNetworkPath>) => patch({ paths: paths.map(x => (x.id === id ? { ...x, ...p } : x)) });
  const add = () => { const id = nextId(paths.map(x => x.id)); patch({ paths: [...paths, { id, name: `Path ${paths.length + 1}`, providerName: '', sharedRiskGroups: [], linkType: 'Leased wavelength', capacityGbps: paths[0]?.capacityGbps ?? 400, monthlyUsd: 0, installUsd: 0, termMonths: 36, diversityGroup: `${an.a.dc?.code}·${an.z.dc?.code}·DCI`, encryption: 'MACsec', aDeviceId: an.a.routers[paths.length % Math.max(1, an.a.routers.length)]?.id, zDeviceId: an.z.routers[paths.length % Math.max(1, an.z.routers.length)]?.id }] }); };
  const routerOpts = (side: 'A' | 'Z') => (side === 'A' ? an.a : an.z).routers.map(r => ({ value: r.id, label: `${r.name} · ${r.model ?? ''}` }));
  const portOpts = (deviceId: string | undefined, g: number) => freePorts(data, deviceId, g).map(p => ({ value: p.name, label: `${p.name} · ${p.speedGbps}G` }));
  const srgAll = [...new Set(paths.flatMap(x => x.sharedRiskGroups))];
  const s = an.survivability; const d = an.diversity;
  return (<>
    <ParamGrid keys={['protection', 'protectedSharePct', 'latencyBudgetMs', 'encryptionRequired', 'demandYears', 'demandOverrideReason', 'diversityWaiver']} defs={defs} cols={4} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} />
    <SubTitle>Demand</SubTitle>
    <DemandChart an={an} />
    <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{an.demand?.basis}.{an.demand?.overridden && !an.demand.reason ? ' The capacity in Requirements differs from the derived need: give a reason above.' : ''}</div>
    <div style={{ ...grid4, marginTop: 8 }}>
      <Stat label="With one path lost" value={s ? gb(s.remainingGbps) : '—'} sub={s ? `for ${gb(s.protectedGbps)} protected` : undefined} tone={s ? (s.ok ? 'ok' : 'bad') : undefined} />
      <Stat label="Diversity" value={d ? (d.ok ? 'Diverse' : d.waived ? 'Waived' : 'Shared risk') : '—'} tone={d ? (d.ok ? 'ok' : d.waived ? 'warn' : 'bad') : undefined} sub={d?.shared[0]} />
      <Stat label="Monthly change" value={fmtUsd(ev!.estimate.opexMonthly)} sub={`${fmtUsd(an.newMonthlyUsd)} new, ${fmtUsd(an.ceasedMonthlyUsd)} ceased`} />
      <Stat label="One-off cost" value={fmtUsd(ev!.estimate.capexTotal)} sub={an.etcUsd ? `includes ${fmtUsd(an.etcUsd)} early termination` : 'install, optics, ports, cross-connects'} />
    </div>
    <SubTitle extra={<Button size="small" icon={<PlusOutlined />} onClick={add}>Add a path</Button>}>Paths</SubTitle>
    <div className="vw-flex vw-flex-col vw-gap-sm">
      {paths.map(p => {
        const r = an.paths.find(x => x.path.id === p.id);
        return (
          <div key={p.id} className="vw-card-child" style={{ padding: '10px 12px' }}>
            <div className="vw-flex vw-gap-sm vw-items-center vw-wrap">
              <Input size="small" value={p.name} style={{ width: 120 }} onChange={e => set(p.id, { name: e.target.value })} />
              <Select size="small" showSearch optionFilterProp="label" value={p.providerId} placeholder="Carrier" style={{ width: 160 }} options={data.providers.map(x => ({ value: x.id, label: x.name }))} onChange={v => set(p.id, { providerId: v, providerName: data.providers.find(x => x.id === v)?.name ?? '' })} />
              <Select size="small" value={p.linkType} style={{ width: 210 }} options={LINK_TYPES.map(t => ({ value: t, label: t }))} onChange={v => set(p.id, { linkType: v })} />
              <InputNumber size="small" min={1} value={p.capacityGbps} addonAfter="Gbps" style={{ width: 130 }} onChange={v => set(p.id, { capacityGbps: v ?? 0 })} />
              {r && <VwChip variant={r.problems.length ? 'error' : 'success'}>{r.problems.length ? `${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}` : 'Checks pass'}</VwChip>}
              <span style={{ flex: 1 }} />
              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove path" onClick={() => patch({ paths: paths.filter(x => x.id !== p.id) })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
              <Field label="Route id"><Input size="small" value={p.routeId ?? ''} onChange={e => set(p.id, { routeId: e.target.value || undefined })} /></Field>
              <Field label="Shared-risk groups" hint="Ducts, landing stations, cable systems"><Select size="small" mode="tags" value={p.sharedRiskGroups} options={srgAll.map(g => ({ value: g, label: g }))} onChange={v => set(p.id, { sharedRiskGroups: v })} /></Field>
              <Field label="Route length" hint={r?.distanceSource}><InputNumber size="small" min={0} value={p.distanceKm} placeholder={r ? String(r.distanceKm) : undefined} addonAfter="km" onChange={v => set(p.id, { distanceKm: v ?? undefined })} /></Field>
              <Field label="Round-trip latency" hint={r?.latencySource}><InputNumber size="small" min={0} step={0.1} value={p.latencyMs} placeholder={r ? String(r.latencyMsRtt) : undefined} addonAfter="ms" onChange={v => set(p.id, { latencyMs: v ?? undefined })} /></Field>
              <Field label="A-end device and port" hint={r?.a.detail}><span className="vw-flex vw-gap-xs"><Select size="small" value={p.aDeviceId} style={{ flex: 1, minWidth: 0 }} options={routerOpts('A')} onChange={v => set(p.id, { aDeviceId: v, aPortName: undefined })} /><Select size="small" allowClear value={p.aPortName} placeholder="Port" style={{ width: 110 }} options={portOpts(p.aDeviceId, p.capacityGbps)} onChange={v => set(p.id, { aPortName: v })} /></span></Field>
              <Field label="Z-end device and port" hint={r?.z.detail}><span className="vw-flex vw-gap-xs"><Select size="small" value={p.zDeviceId} style={{ flex: 1, minWidth: 0 }} options={routerOpts('Z')} onChange={v => set(p.id, { zDeviceId: v, zPortName: undefined })} /><Select size="small" allowClear value={p.zPortName} placeholder="Port" style={{ width: 110 }} options={portOpts(p.zDeviceId, p.capacityGbps)} onChange={v => set(p.id, { zPortName: v })} /></span></Field>
              <Field label="Charges" hint="Monthly, one-off, term"><span className="vw-flex vw-gap-xs"><InputNumber size="small" min={0} value={p.monthlyUsd} addonAfter="/mo" style={{ flex: 1 }} onChange={v => set(p.id, { monthlyUsd: v ?? 0 })} /><InputNumber size="small" min={0} value={p.installUsd} style={{ width: 90 }} onChange={v => set(p.id, { installUsd: v ?? 0 })} /><InputNumber size="small" min={1} value={p.termMonths} addonAfter="mo" style={{ width: 90 }} onChange={v => set(p.id, { termMonths: v ?? 36 })} /></span></Field>
              <Field label="Replaces and encryption"><span className="vw-flex vw-gap-xs"><Select size="small" allowClear value={p.replacesCircuitId} placeholder="New capacity" style={{ flex: 1, minWidth: 0 }} options={an.circuits.map(c => ({ value: c.circuit.id, label: `${c.circuit.cid} · ${c.capacityGbps}G` }))} onChange={v => set(p.id, { replacesCircuitId: v })} /><Select size="small" value={p.encryption ?? 'None'} style={{ width: 110 }} options={['MACsec', 'Optical (OTNsec)', 'IPsec', 'None'].map(v => ({ value: v, label: v }))} onChange={v => set(p.id, { encryption: v as T.PlannerNetworkPath['encryption'] })} /></span></Field>
            </div>
            {r && <div style={{ fontSize: 12, color: r.problems.length ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-600)', marginTop: 6 }}>{r.problems.length ? r.problems.join('; ') : `${r.optic.model} at both ends; ${r.reachNote}; ${r.reachClass} delivery.`}</div>}
          </div>
        );
      })}
      {!paths.length && <div className="vw-card-description">No paths yet. Add one per carrier or fibre route; two on different carriers and routes is the usual minimum.</div>}
    </div>
    <SubTitle>Addresses and routing</SubTitle>
    <IpTable an={an} />
  </>);
}

function IpTable({ an }: { an: NetworkAnalysis }) {
  const items = an.ip?.items ?? [];
  return (<>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Path</th><th>Prefix</th><th>From pool</th><th>A / Z address</th><th>BGP</th></tr></thead>
      <tbody>{items.map((i, k) => <tr key={k}><td>{an.paths.find(x => x.path.id === i.pathId)?.path.name ?? i.pathId}{i.end !== 'link' ? ` · ${i.end} end` : ''}</td><td>{i.cidr ?? <VwChip variant="error">Not allocated</VwChip>}</td><td>{i.poolCidr ?? '—'}</td><td>{i.aAddr ? `${i.aAddr} / ${i.zAddr}` : '—'}</td><td>{i.bgp.kind}</td></tr>)}
        {!items.length && <tr><td colSpan={5} style={{ color: 'var(--vw-color-slate-500)' }}>Add paths to allocate point-to-point addresses.</td></tr>}</tbody>
    </table></div>
    {an.ip?.warnings.map(w => <div key={w} style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{w}.</div>)}
  </>);
}

function FabricPanel(props: StepProps) {
  const { draft, ev, templates, setParam, resetParam } = props;
  const an = networkOf(ev); const f = an?.fabric;
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  return (<>
    <ParamGrid keys={['fabricTargetGbps', 'fabricUplinksPerLeaf', 'fabricTargetOversub']} defs={defs} cols={3} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} />
    {!f ? <div className="vw-card-description">{an?.reason ?? 'Pick the site.'}</div> : (<>
      <div style={{ ...grid4, marginTop: 8 }}>
        <Stat label="Fabric today" value={`${f.leaves.length} leaves`} sub={`${f.spines.length} spines · ${f.currentUplinks} × ${f.currentUplinkGbps}G per leaf`} />
        <Stat label="Oversubscription" value={`${f.oversubNow}:1 → ${f.oversubAfter}:1`} tone={f.oversubAfter <= f.targetOversub ? 'ok' : 'bad'} sub={`target ${f.targetOversub}:1`} />
        <Stat label="Switches replaced" value={f.leavesToReplace.length + f.spinesToReplace.length} sub={`${f.leavesToReplace.length} leaves, ${f.spinesToReplace.length} spines below ${f.targetGbps}G`} />
        <Stat label="Spine ports" value={`${f.spinePortsAfter} / ${f.uplinkPortsNeeded}`} tone={f.spinePortsAfter >= f.uplinkPortsNeeded ? 'ok' : 'bad'} sub={`${f.spinesNeeded} new spine(s)`} />
      </div>
      {f.notes.map(n => <div key={n} style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{n}.</div>)}
    </>)}
  </>);
}

/** Delivery: the cut-over date and the dated order and gate list (dated whatever the kW). */
export function NetworkDeliveryPanel(props: StepProps) {
  const { draft, patch, ev, templates, setParam, resetParam } = props;
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const setCutover = (iso: string) => patch({ targetGoLive: iso, phases: draft.phases.length ? draft.phases.map((p, i, all) => (i === all.length - 1 ? { ...p, goLive: iso } : p)) : [{ id: 'PH-1', name: 'Cut-over', goLive: iso, itKw: 0, racks: 0, halls: 0, status: 'Planned' }] });
  const cut = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop()?.goLive ?? draft.targetGoLive;
  return (<>
    <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <Field label="Cut-over date"><Input size="small" type="date" value={toDateInput(cut)} onChange={e => setCutover(fromDateInput(e.target.value, cut))} /></Field>
    </div>
    <div style={{ marginTop: 8 }}><ParamGrid keys={['cutoverWindowHours', 'ceaseSoakDays', 'earlyTerminationPct', 'crossConnectNrcUsd', 'crossConnectMrcUsd', 'orgAsn', 'dciP2pPool', 'demarcSpanKm']} defs={defs} cols={4} ev={ev} draft={draft} setParam={setParam} resetParam={resetParam} /></div>
    <SubTitle>Orders and gates</SubTitle>
    <ScheduleTable ev={ev} />
  </>);
}
function ScheduleTable({ ev }: { ev?: StepProps['ev'] }) {
  const items = ev?.schedule ?? [];
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Lead</th><th>Order by</th><th>Needed by</th><th>Status</th></tr></thead>
      <tbody>{items.map((s, i) => <tr key={i}><td title={s.note}>{s.item}</td><td style={{ textAlign: 'right' }}>{s.kind === 'gate' ? '—' : `${s.leadWeeks} wk`}</td><td>{s.kind === 'gate' ? '—' : fmtDay(s.orderBy)}</td><td>{fmtDay(s.needBy)}</td><td>{s.kind === 'gate' ? <VwChip variant="neutral">Gate</VwChip> : s.late ? <VwChip variant="error">Late</VwChip> : <VwChip variant="success">On time</VwChip>}</td></tr>)}</tbody>
    </table></div>
  );
}

/** Plan page tab and pack section: ends, circuits, paths, addresses and the cut-over. */
export function NetworkView({ ev }: PlanViewProps) {
  const an = networkOf(ev);
  if (!an) return null;
  if (an.kind === 'fabric') return <div className="vw-flex vw-flex-col vw-gap-sm"><ScheduleTable ev={ev} /></div>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}><EndCard an={an} side="A" /><EndCard an={an} side="Z" /></div>
      <PathsTable an={an} />
      <DemandChart an={an} />
      <IpTable an={an} />
      <ScheduleTable ev={ev} />
    </div>
  );
}
export function PathsTable({ an }: { an: NetworkAnalysis }) {
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Path</th><th>Carrier</th><th>Type</th><th style={{ textAlign: 'right' }}>Capacity</th><th style={{ textAlign: 'right' }}>RTT</th><th>Route / shared risk</th><th>A end</th><th>Z end</th><th style={{ textAlign: 'right' }}>Monthly</th><th>Circuit</th></tr></thead>
      <tbody>{an.paths.map(x => (
        <tr key={x.path.id}><td>{x.path.name}</td><td>{x.provider?.name ?? x.path.providerName}</td><td>{x.path.linkType}</td><td style={{ textAlign: 'right' }}>{x.path.capacityGbps}G</td><td style={{ textAlign: 'right' }}>{x.latencyMsRtt} ms</td><td>{x.path.routeId ?? '—'} · {x.path.sharedRiskGroups.join(', ') || '—'}</td><td>{x.a.device?.name ?? '—'} {x.a.port ?? (x.a.lineCard ? '(line card)' : '')}</td><td>{x.z.device?.name ?? '—'} {x.z.port ?? (x.z.lineCard ? '(line card)' : '')}</td><td style={{ textAlign: 'right' }}>{fmtUsd(x.path.monthlyUsd)}</td><td>{x.path.circuitId ?? '—'}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
