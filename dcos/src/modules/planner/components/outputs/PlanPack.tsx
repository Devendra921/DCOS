/* Plan pack: what the plan turns into so it can be built — document, bill of materials, IP plan, drawings and initiation. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, PackageOpen } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Chip, Panel, Seg } from '../../../../ops/ui/kit';
import type { Tone } from '../../../../ops/lib/tone';
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

const STATUS: Record<ArtefactStatus, { label: string; tone: Tone }> = {
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
    <div className="col" style={{ gap: 16 }}>
      <Panel flush icon={PackageOpen} title="What this plan creates"
        actions={<Muted>{plan.artefacts ? `${created} of ${lines.filter(l => l.status !== 'na').length} created` : plan.status === 'Approved' ? 'Created when the plan is executed' : plan.status === 'Executing' || plan.status === 'Completed' ? 'Executed before build records were tracked' : 'Generated from the plan as it stands; created on approval'}</Muted>}>
        <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
          <tbody>{lines.map(l => (
            <tr key={l.key}>
              <td><span className={l.status === 'na' ? 'vw-label' : 'strong'}>{l.label}</span></td>
              <td style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.detail}><span className="vw-label">{l.detail}</span></td>
              <td><span className="row" style={{ gap: 10 }}>{l.links.map(k => <Link key={k.to + k.label} to={k.to}>{k.label}</Link>)}</span></td>
              <td className="is-right"><Chip tone={STATUS[l.status].tone} dot>{STATUS[l.status].label}</Chip></td>
            </tr>
          ))}</tbody>
        </table></div></div>
      </Panel>

      {manifest.length > 0 && (
        <Panel icon={Boxes} title="Plan pack" sub="The outputs this plan type delivers (from the plan template)">
          <div className="row wrap" style={{ gap: 6 }}>
            {manifest.map(m => m.section
              ? <button key={m.output} type="button" onClick={() => setSection(m.section!)} style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}><Chip tone={m.family ? 'info' : 'neutral'}>{m.output} · {m.sectionLabel}</Chip></button>
              : <Chip key={m.output} tone="warning">{m.output} · not generated yet</Chip>)}
          </div>
        </Panel>
      )}

      <Seg<string>
        size="sm"
        value={section}
        onChange={setSection}
        options={[...PACK_SECTIONS.map(s => ({ id: s.value as string, label: `${s.label} ${counts[s.value]}` })), ...extra.map(x => ({ id: x.key, label: x.count ? `${x.label} ${x.count(viewProps)}` : x.label }))]}
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
