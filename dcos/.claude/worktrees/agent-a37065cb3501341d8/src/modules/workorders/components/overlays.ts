/** HTML overlays drawn on the diagram for waiting user tasks and engine incidents. */
import type * as T from '../../../mock/data/types';
import type { WfOverlay } from './BpmnViewerInner';
import { fmtDue } from '../lib/useWorkflows';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function taskOverlays(tasks: T.ProcessUserTask[], incidents: T.EngineIncident[] = []): WfOverlay[] {
  const out: WfOverlay[] = [];
  for (const t of tasks) {
    if (t.state !== 'created') continue;
    const due = fmtDue(t.dueAt);
    out.push({
      elementId: t.elementId,
      position: { bottom: -8, left: 0 },
      html: `<div class="wf-overlay${due.overdue ? ' wf-overlay--overdue' : ''}"><span>${esc(t.assignee ?? `${t.candidateRole} · unassigned`)}</span><small>${esc(due.text)}</small></div>`,
    });
  }
  for (const e of incidents) {
    out.push({ elementId: e.elementId, position: { bottom: -8, left: 0 }, html: `<div class="wf-overlay wf-overlay--incident">${esc(e.message)}</div>` });
  }
  return out;
}
