/* UI for the replace family of plan types (see lib/scopes/replace.ts): result panels that replace
   the plant, fabric and IT panels, plan pack sections and the "Waves and closure" tab. */
import type { ScopeUi } from '../types';
import { replaceOf } from '../../../lib/replaceAnalysis';
import { ReplaceDeliveryPanel, ReplaceItPanel, ReplaceNetworkPanel, ReplacePowerPanel, ReplaceSpacePanel, ReplaceWavesPanel } from './Panels';
import { ClosureChecklist, OldToNew, PeopleSection, PortsAndPatching, Runbook, WaveSchedule } from './PackSections';
import { WavesTab } from './WavesTab';

export const replaceUi: ScopeUi = {
  panels: { space: ReplaceSpacePanel, power: ReplacePowerPanel, network: ReplaceNetworkPanel, it: ReplaceItPanel, delivery: ReplaceDeliveryPanel, migration: ReplaceWavesPanel },
  packSections: [
    { key: 'oldnew', label: 'Old to new', count: p => String(p.plan.scope === 'rack-replace' ? replaceOf(p.ev)?.rackIds.length ?? 0 : replaceOf(p.ev)?.old.length ?? 0), render: p => <OldToNew {...p} /> },
    { key: 'waves', label: 'Wave schedule', count: p => String((p.plan.waves ?? []).length), render: p => <WaveSchedule {...p} /> },
    { key: 'runbook', label: 'Cut-over runbook', render: p => <Runbook {...p} /> },
    { key: 'ports', label: 'Ports and patching', render: p => <PortsAndPatching {...p} /> },
    { key: 'people', label: 'Consent and notification', count: p => String(p.plan.scope === 'rack-replace' ? replaceOf(p.ev)?.rack?.consents.length ?? 0 : replaceOf(p.ev)?.impact.customers.length ?? 0), render: p => <PeopleSection {...p} /> },
    { key: 'closure', label: 'Closure checklist', render: p => <ClosureChecklist {...p} /> },
  ],
  detailTabs: [{ key: 'waves', label: 'Waves and closure', badge: p => (p.plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled').length || undefined, render: p => <WavesTab {...p} family="replace" /> }],
};
