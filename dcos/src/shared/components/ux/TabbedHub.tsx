import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import { ModuleHeader } from './ModuleHeader';
import { ModulePageBody } from '../ops/ModulePageBody';

export interface HubTab { label: string; path: string; el: ReactNode }

/** URL-synced module tabs rendered as the shared module header (title, description, pill tabs, scope). */
export function TabbedHub({ tabs, extra, title, description }: { tabs: HubTab[]; extra?: ReactNode; title?: string; description?: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const active = tabs.find((t) => t.path === loc.pathname)?.path ?? tabs[0].path;
  return (
    <div className="vw-flex vw-flex-col" style={{ minWidth: 0 }}>
      <ModuleHeader title={title} description={description} actions={<>{extra}<PageDcScopeSelect /></>}
        tabs={tabs.map((t) => ({ value: t.path, label: t.label }))} active={active} onTab={nav} />
      {title
        ? <ModulePageBody overview={active === tabs[0].path}>{tabs.find((t) => t.path === active)?.el}</ModulePageBody>
        : <div className="module-screen">{tabs.find((t) => t.path === active)?.el}</div>}
    </div>
  );
}
export default TabbedHub;
