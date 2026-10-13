/* Programme materials roll-up: per project, how much of its kit is at the site, what is late and
   the next work step's kit readiness. Advisory only, like readiness everywhere else. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type * as T from '../../../../mock/data/types';
import { Package } from 'lucide-react';
import { Panel } from '../../../../ops/ui/kit';
import { linesOfProject, materialsByStep, readinessOf, type ReadinessView, type StepMaterials } from '../../lib/materialRules';
import { useMaterialData } from '../../lib/materialHooks';
import { DataTable, Muted } from '../project/kit';
import { shortName } from '../project/format';
import { ReadinessChip } from '../project/materials';
import { orderedSteps, stepLabel } from '../project/materialView';

interface Row { p: T.Project; kit: ReadinessView; next?: StepMaterials }

export function ProgramMaterialsCard({ projects, programName }: { projects: T.Project[]; programName: string }) {
  const m = useMaterialData();
  const [now] = useState(() => Date.now());
  const rows = useMemo<Row[]>(() => projects.map((p) => {
    const lines = linesOfProject(m, p.id);
    // The next step still waiting on materials, in process order.
    const next = orderedSteps(p.template, materialsByStep(lines, now)).find((s) => s.total > 0 && s.used < s.total);
    return { p, kit: readinessOf(lines, now), next };
  }), [projects, m, now]);
  const total = rows.reduce((a, r) => a + r.kit.lines, 0);
  const atSite = rows.reduce((a, r) => a + r.kit.atSite, 0);
  const late = rows.reduce((a, r) => a + r.kit.late.length, 0);
  return (
    <Panel title="Materials by project" icon={Package} sub={total ? `${atSite} of ${total} items at site${late ? ` · ${late} late` : ''}` : 'none planned'}>
      <DataTable rows={rows} rowKey={(r) => r.p.id} empty="No projects in this programme yet."
        cols={[
          { key: 'n', title: 'Project', wrap: true, render: (r) => <Link to={`/delivery/projects/${r.p.id}?tab=procurement`}>{shortName(r.p.name, programName)}</Link> },
          { key: 'k', title: 'Kit', render: (r) => (r.kit.lines ? <ReadinessChip view={r.kit} /> : <Muted>none planned</Muted>) },
          { key: 's', title: 'At site', align: 'right', render: (r) => (r.kit.lines ? `${r.kit.atSite} of ${r.kit.lines}` : <Muted>—</Muted>) },
          { key: 'l', title: 'Late', align: 'right', render: (r) => (r.kit.late.length ? <span style={{ color: 'var(--vw-color-red-600)' }}>{r.kit.late.length}</span> : <Muted>0</Muted>) },
          { key: 'x', title: 'Next step needing materials', wrap: true, render: (r) => (r.next
            ? <span className="vw-inline-flex vw-items-center vw-gap-sm vw-wrap">{stepLabel(r.p.template, r.next.stepId)}<ReadinessChip view={r.next.readiness} /></span>
            : <Muted>{r.kit.lines ? 'all used' : '—'}</Muted>) },
        ]} />
    </Panel>
  );
}
