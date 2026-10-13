/* UI for the migration family of plan types (see lib/scopes/migration.ts): the inventory and mode on
   Requirements, result panels, plan pack sections and the "Waves and closure" tab. */
import type { ScopeUi } from '../types';
import { migrationOf } from '../../../lib/migrationCore';
import { MigrationInventory } from './Inventory';
import { MigrationDeliveryPanel, MigrationItPanel, MigrationNetworkPanel, MigrationSecurityPanel, MigrationSpacePanel, MigrationWavesPanel } from './Panels';
import { Compliance, ExitPlan, InventoryRegister, MigrationClosure, MigrationConsents, MigrationRunbook } from './PackSections';
import { WaveSchedule } from '../replace/PackSections';
import { WavesTab } from '../replace/WavesTab';

export const migrationUi: ScopeUi = {
  requirements: p => <MigrationInventory {...p} />,
  panels: { space: MigrationSpacePanel, network: MigrationNetworkPanel, it: MigrationItPanel, firesec: MigrationSecurityPanel, delivery: MigrationDeliveryPanel, migration: MigrationWavesPanel },
  packSections: [
    { key: 'inventory', label: 'Inventory', count: p => String(migrationOf(p.ev)?.rows.length ?? 0), render: p => <InventoryRegister {...p} /> },
    { key: 'waves', label: 'Wave schedule', count: p => String((p.plan.waves ?? []).length), render: p => <WaveSchedule {...p} /> },
    { key: 'runbook', label: 'Cut-over runbook', render: p => <MigrationRunbook {...p} /> },
    { key: 'consents', label: 'Consent register', count: p => String(migrationOf(p.ev)?.consents.length ?? 0), render: p => <MigrationConsents {...p} /> },
    { key: 'exit', label: 'Circuits, contracts, addresses', render: p => <ExitPlan {...p} /> },
    { key: 'compliance', label: 'Compliance', count: p => String(migrationOf(p.ev)?.permits.length ?? 0), render: p => <Compliance {...p} /> },
    { key: 'closure', label: 'Closure checklist', render: p => <MigrationClosure {...p} /> },
  ],
  detailTabs: [{ key: 'waves', label: 'Waves and closure', badge: p => (p.plan.waves ?? []).filter(w => w.status !== 'Closed' && w.status !== 'Cancelled').length || undefined, render: p => <WavesTab {...p} family="migration" /> }],
};
