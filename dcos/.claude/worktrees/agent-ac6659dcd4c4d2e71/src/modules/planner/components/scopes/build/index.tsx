/* UI for the build family of plan types (see lib/scopes/build.ts): new data centre, site expansion, regional portfolio, edge rollout. */
import type { ScopeUi } from '../types';
import { analysisOf } from './model';
import { BuildPowerPanel, BuildRequirements, BuildSitePicker, CommissioningSection, SitePlanSection } from './BuildViews';

export const buildUi: ScopeUi = {
  sitePicker: BuildSitePicker,
  requirements: BuildRequirements,
  panels: { power: BuildPowerPanel },
  packSections: [
    {
      key: 'site-plan', label: 'Site plan', render: SitePlanSection,
      count: ({ plan, ev }) => { const a = analysisOf(ev); return plan.scope === 'edge' ? `${a?.edge?.sites.length ?? 0}` : plan.scope === 'portfolio' ? `${a?.portfolio?.rows.length ?? 0}` : plan.scope === 'new-dc' ? `${plan.candidates?.length ?? 0}` : `${a?.campus?.rows.length ?? 0}`; },
    },
    { key: 'commissioning', label: 'Acceptance and handover', render: CommissioningSection },
  ],
};
