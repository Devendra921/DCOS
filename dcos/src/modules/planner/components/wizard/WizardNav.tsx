/* Left navigation of the wizard: steps grouped into Set up, Design, Delivery, Business and Decide.
   The design groups come from the plan template, so the list itself shows what this plan covers. */
import { CheckOutlined } from '../../../../shared/icons';
import type { StepDef } from './wizardModel';

export function WizardNav({ steps, current, maxVisited, onPick }: { steps: StepDef[]; current: number; maxVisited: number; onPick: (i: number) => void }) {
  const groups: { name: StepDef['group']; items: { s: StepDef; i: number }[] }[] = [];
  steps.forEach((s, i) => { const g = groups.find(x => x.name === s.group); if (g) g.items.push({ s, i }); else groups.push({ name: s.group, items: [{ s, i }] }); });
  return (
    <nav aria-label="Plan wizard steps" className="vw-flex vw-flex-col vw-gap-sm">
      {groups.map(g => (
        <div key={g.name}>
          <div className="vw-card-metric-label" style={{ padding: '0 8px 4px' }}>{g.name}</div>
          {g.items.map(({ s, i }) => {
            const active = i === current; const done = i < current || (i <= maxVisited && i !== current); const open = i <= maxVisited;
            return (
              <button key={s.key} type="button" onClick={() => open && onPick(i)} disabled={!open} title={s.hint}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', border: 0, borderRadius: 8, cursor: open ? 'pointer' : 'default',
                  background: active ? 'var(--vw-color-slate-900)' : 'transparent', color: active ? 'var(--vw-color-white, #fff)' : open ? 'var(--vw-color-slate-800)' : 'var(--vw-color-slate-400)' }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                  background: active ? 'var(--vw-color-white, #fff)' : done ? 'var(--vw-color-green-600)' : 'var(--vw-color-slate-100)', color: active ? 'var(--vw-color-slate-900)' : done ? 'var(--vw-color-white, #fff)' : 'var(--vw-color-slate-500)' }}>
                  {done && !active ? <CheckOutlined style={{ fontSize: 11 }} /> : i + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, flex: 1, minWidth: 0 }}>{s.label}</span>
                {s.depth === 'summary' && <span style={{ fontSize: 11, opacity: 0.7 }}>brief</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
