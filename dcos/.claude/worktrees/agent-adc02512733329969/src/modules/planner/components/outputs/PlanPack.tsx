/* Plan pack: what the plan turns into so it can be built — document, bill of materials, IP plan, drawings and initiation. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, VwSegmented, type VwChipVariant } from '../../../../shared/components/ux';
import type { Evaluation } from '../../lib/engine';
import type { SourcingContext } from '../../lib/sourcing';
import { Muted } from '../detail/shared';
import { BomView } from './BomView';
import { DrawingsView } from './DrawingsView';
import { InitiationView } from './InitiationView';
import { IpPlanView } from './IpPlanView';
import { PlanDocument } from './PlanDocument';
import { PACK_SECTIONS, artefactLines, buildPack, packManifest, vendorOrders, type ArtefactStatus, type PackSection } from './packModel';
import './print.css';
import { uiFor } from '../scopes/registry';
import type { PlannerData } from '../../lib/plannerData';

const STATUS: Record<ArtefactStatus, { label: string; tone: VwChipVariant }> = {
  ready: { label: 'Ready to generate', tone: 'neutral' },
  approved: { label: 'Created when executed', tone: 'info' },
  created: { label: 'Created', tone: 'success' },
  none: { label: 'Not created', tone: 'warning' },
  na: { label: 'Not part of this plan type', tone: 'neutral' },
};

export function PlanPack({ plan, ev, template, benchmarks, siteName, sourcing }: { plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[]; siteName: string; sourcing?: SourcingContext }) {
  const [section, setSection] = useState<string>('document');
  const extra = useMemo(() => uiFor(plan.scope).packSections ?? [], [plan.scope]);
  const viewProps = { plan, ev, data: ev.ctx.data ?? ({} as PlannerData), template, benchmarks };
  const pack = useMemo(() => buildPack(plan, ev, template, benchmarks, siteName, sourcing), [plan, ev, template, benchmarks, siteName, sourcing]);
  const lines = useMemo(() => artefactLines(plan, pack), [plan, pack]);
  const created = lines.filter(l => l.status === 'created').length;
  const manifest = useMemo(() => packManifest(template, extra), [template, extra]);

  const counts: Record<PackSection, string> = {
    document: `${pack.bod.length}`,
    bom: `${pack.bom.lines.length}`,
    ip: pack.applies.ip ? `${pack.ip.items.length}` : '—',
    drawings: `${pack.sheets.length}`,
    initiation: `${pack.init.projects.length + (pack.sourced ? vendorOrders(pack.sourced).length : pack.init.orders.length)}`,
  };

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard
        title="What this plan creates"
        extra={<Muted>{plan.artefacts ? `${created} of ${lines.filter(l => l.status !== 'na').length} created` : plan.status === 'Approved' ? 'Created when the plan is executed' : plan.status === 'Executing' || plan.status === 'Completed' ? 'Executed before build records were tracked' : 'Generated from the plan as it stands; created on approval'}</Muted>}
      >
        <div className="vw-flex vw-flex-col">
          {lines.map(l => (
            <div key={l.key} className="vw-grid" style={{ gridTemplateColumns: 'minmax(170px, 220px) minmax(0, 1fr) auto auto', columnGap: 'var(--vw-space-md)', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 'var(--vw-font-label-sm)' }}>
              <span style={{ fontWeight: 500, color: l.status === 'na' ? 'var(--vw-color-slate-500)' : 'var(--vw-color-slate-900)' }}>{l.label}</span>
              <span style={{ color: 'var(--vw-color-slate-600)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.detail}>{l.detail}</span>
              <span className="vw-inline-flex vw-gap-sm">{l.links.map(k => <Link key={k.to + k.label} to={k.to} style={{ whiteSpace: 'nowrap' }}>{k.label}</Link>)}</span>
              <VwChip variant={STATUS[l.status].tone}>{STATUS[l.status].label}</VwChip>
            </div>
          ))}
        </div>
      </VwCard>

      {manifest.length > 0 && (
        <VwCard title="Plan pack" extra={<Muted>The outputs this plan type delivers (from the plan template)</Muted>}>
          <div className="vw-flex vw-gap-xs vw-wrap">
            {manifest.map(m => m.section
              ? <a key={m.output} onClick={() => setSection(m.section!)}><VwChip variant={m.family ? 'info' : 'neutral'}>{m.output} · {m.sectionLabel}</VwChip></a>
              : <VwChip key={m.output} variant="warning">{m.output} · not generated yet</VwChip>)}
          </div>
        </VwCard>
      )}

      <VwSegmented<string>
        size="small"
        value={section}
        onChange={setSection}
        options={[...PACK_SECTIONS.map(s => ({ value: s.value as string, label: <span>{s.label} <span style={{ color: 'var(--vw-color-slate-500)', marginLeft: 2 }}>{counts[s.value]}</span></span> })), ...extra.map(x => ({ value: x.key, label: <span>{x.label}{x.count && <span style={{ color: 'var(--vw-color-slate-500)', marginLeft: 4 }}>{x.count(viewProps)}</span>}</span> }))]}
      />
      {extra.filter(x => x.key === section).map(x => <div key={x.key}>{x.render(viewProps)}</div>)}

      {section === 'document' && <PlanDocument plan={plan} template={template} sections={pack.bod} siteName={siteName} />}
      {section === 'bom' && <BomView plan={plan} bom={pack.bom} sourced={pack.sourced} capexTotal={ev.estimate.capexTotal} />}
      {section === 'ip' && <IpPlanView plan={plan} ip={pack.ip} applies={pack.applies.ip} />}
      {section === 'drawings' && <DrawingsView plan={plan} ev={ev} sheets={pack.sheets} />}
      {section === 'initiation' && <InitiationView plan={plan} init={pack.init} sourced={pack.sourced} />}
    </div>
  );
}
