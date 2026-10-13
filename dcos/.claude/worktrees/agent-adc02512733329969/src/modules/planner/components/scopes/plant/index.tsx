/* UI for the plant family of plan types (see lib/scopes/plant.ts). */
import { plantOf } from '../../../lib/scopes/plant';
import type { ScopeUi } from '../types';
import { CutInTable, PlantCoolingPanel, PlantDeliveryPanel, PlantPowerPanel, PlantSitePicker, PlantView } from './PlantPanels';

export const plantUi: ScopeUi = {
  sitePicker: PlantSitePicker,
  panels: { power: PlantPowerPanel, cooling: PlantCoolingPanel, delivery: PlantDeliveryPanel },
  packSections: [
    { key: 'plant-asis', label: 'Plant, as-is and to-be', count: p => `${p.plan.plantLines?.length ?? 0} lines`, render: p => <PlantView {...p} /> },
    { key: 'plant-cutins', label: 'Cut-in sequence', count: p => `${p.plan.cutIns?.length ?? 0} steps`, render: p => { const an = plantOf(p.ev); return an ? <CutInTable an={an} /> : null; } },
  ],
  detailTabs: [{ key: 'plant', label: 'Plant and cut-ins', badge: p => plantOf(p.ev)?.cutIns.filter(c => !c.ok).length || undefined, render: p => <PlantView {...p} /> }],
};
