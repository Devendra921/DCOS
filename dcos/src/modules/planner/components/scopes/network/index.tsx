/* UI for the network family of plan types (see lib/scopes/network.ts). */
import { networkOf } from '../../../lib/scopes/network';
import type { ScopeUi } from '../types';
import { NetworkDeliveryPanel, NetworkPanel, NetworkSitePicker, NetworkView, PathsTable } from './NetworkPanels';

export const networkUi: ScopeUi = {
  sitePicker: NetworkSitePicker,
  panels: { network: NetworkPanel, delivery: NetworkDeliveryPanel },
  packSections: [
    { key: 'net-paths', label: 'Paths and diversity', count: p => `${p.plan.paths?.length ?? 0} paths`, render: p => { const an = networkOf(p.ev); return an ? <PathsTable an={an} /> : null; } },
    { key: 'net-cutover', label: 'Interconnect plan', render: p => <NetworkView {...p} /> },
  ],
  detailTabs: [{ key: 'network', label: 'Paths and circuits', badge: p => networkOf(p.ev)?.paths.filter(x => x.problems.length).length || undefined, render: p => <NetworkView {...p} /> }],
};
