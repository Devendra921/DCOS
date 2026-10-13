import { useContext, type ReactNode } from 'react';
import { ModulePageContext } from './moduleContext';
import './module-ui.css';

/**
 * Page frame for DCOS module pages, identical to the Operate screens
 * (Estate, Datacenters, Locations): `.ops-root` + `.page`, a title row with
 * description and actions, then the page's sections.
 *
 * Build the body from the Operate kit so every page shares one design:
 *   StatGrid/StatTile (src/ops/ui/Analytics) — responsive KPI cards
 *   Panel (src/ops/ui/kit)                   — titled cards, `flush` for tables
 *   DataTable + ListToolbar (src/ops/ui)     — every grid
 *   Donut / BarList / TimeChart (src/ops/charts), Chip / Meter (src/ops/ui)
 */
export function OpsPage({ title, description, actions, children, wide }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const module = useContext(ModulePageContext);
  const showTitle = Boolean(title) && !module?.overview;
  const Heading = module ? 'h2' : 'h1';
  return (
    <div className="ops-root ops-embed module-ui">
      <div className={`page${wide ? ' is-full' : ''}`}>
        {(showTitle || actions) && (
          <div className={`ops-page-head${module ? ' is-module-view' : ''}${!showTitle ? ' is-toolbar' : ''}`}>
            {showTitle && <div className="vw-flex vw-flex-col" style={{ minWidth: 0 }}>
              <Heading className="vw-page-title">{title}</Heading>
              {description && <p className="vw-page-description" style={{ margin: '2px 0 0' }}>{description}</p>}
            </div>}
            {actions && <div className="page-actions">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
export default OpsPage;
