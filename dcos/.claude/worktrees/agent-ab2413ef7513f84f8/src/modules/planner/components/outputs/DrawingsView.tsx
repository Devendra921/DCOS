/* Drawings: one framed sheet per drawing with a title block, each built from the plan's sizing. */
import type { ReactNode } from 'react';
import type * as T from '../../../../mock/data/types';
import { VwCard, EmptyState, fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { FileTextOutlined } from '../../../../shared/icons';
import type { Evaluation } from '../../lib/engine';
import { BuildingStack, HallLayoutPreview, LeadTimeGantt, PhaseLadderChart, PlantOneLine } from '../charts';
import { NetworkTopology } from './NetworkTopology';
import { printPlanArea, type DrawingSheet, type SheetKind } from './packModel';

const CELL_LABEL = { fontSize: 9, color: 'var(--vw-color-slate-500)', textTransform: 'uppercase', letterSpacing: 0.4 } as const;

function Sheet({ sheet, date, wide, children }: { sheet: DrawingSheet; date: string; wide?: boolean; children: ReactNode }) {
  const cells: { label: string; value: string; grow?: boolean }[] = [
    { label: 'Drawing', value: sheet.number }, { label: 'Title', value: sheet.title, grow: true }, { label: 'Scale', value: 'NTS' }, { label: 'Rev', value: 'A' }, { label: 'Date', value: date },
  ];
  return (
    <div className="plan-print-sheet" style={{ gridColumn: wide ? '1 / -1' : undefined, border: '1px solid var(--vw-color-slate-400)', borderRadius: 'var(--vw-radius-xs)', background: 'var(--vw-color-white)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: 'var(--vw-space-sm)', flex: 1, minHeight: 0 }}>{children}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto auto', borderTop: '1px solid var(--vw-color-slate-400)' }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{ padding: '3px 8px', borderLeft: i ? '1px solid var(--vw-color-slate-300)' : 0, minWidth: 0 }}>
            <div style={CELL_LABEL}>{c.label}</div>
            <div style={{ fontSize: 'var(--vw-font-label-xs)', fontWeight: c.grow || i === 0 ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: i === 0 ? 'var(--vw-font-mono, monospace)' : undefined }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DrawingsView({ plan, ev, sheets }: { plan: T.PlannerPlan; ev: Evaluation; sheets: DrawingSheet[] }) {
  const s = ev.sizing;
  const density = Number(ev.params['densityKwPerRack']?.value ?? 0);
  const liquid = s.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(s.cooling.type);
  const redundancy = String(ev.params['redundancy']?.value ?? '2N');
  const goLive = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive))[0]?.goLive ?? plan.targetGoLive;
  const date = fmtDate(plan.updatedAt);

  const draw: Record<SheetKind, () => ReactNode> = {
    building: () => <BuildingStack building={s.building} halls={s.halls} buildings={s.buildings} height={260} />,
    hall: () => <HallLayoutPreview sizing={s} densityKwPerRack={density} liquid={liquid} height={260} />,
    'single-line': () => <PlantOneLine sizing={s} redundancy={redundancy} height={260} />,
    topology: () => <NetworkTopology network={s.network} racks={s.racks} height={260} />,
    phasing: () => <PhaseLadderChart rows={ev.ladder} growthPctPerYear={plan.demand.growthPctPerYear} height={260} />,
    'lead-times': () => <LeadTimeGantt items={ev.schedule} goLive={goLive} height={Math.max(240, ev.schedule.length * 24 + 60)} />,
  };

  if (!sheets.length) {
    return <VwCard><EmptyState title="No drawings for this plan type" description="This plan has no building, hall, power, network or phasing content to draw." /></VwCard>;
  }

  return (
    <VwCard title="Drawing set" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><span className="vw-card-description">{sheets.length} sheet{sheets.length === 1 ? '' : 's'} · schematic, not to scale</span><Button size="small" icon={<FileTextOutlined />} onClick={printPlanArea}>Print drawings</Button></span>}>
      <div className="plan-print-area">
        <div className="vw-grid vw-gap-md plan-print-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          {sheets.map(sh => <Sheet key={sh.number} sheet={sh} date={date} wide={sh.kind === 'lead-times'}>{draw[sh.kind]()}</Sheet>)}
        </div>
      </div>
    </VwCard>
  );
}
