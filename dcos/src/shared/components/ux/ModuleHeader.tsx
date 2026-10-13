import type { ReactNode } from 'react';
import { VwSegmented } from './VwSegmented';

export interface ModuleTab { value: string; label: ReactNode }

/**
 * Module page header — the same anatomy as Work orders / Estate:
 * title + description (left), actions (right), pill tabs underneath, optional second row of sub-tabs.
 */
export function ModuleHeader({ title, description, actions, tabs, active, onTab, subTabs, subActive, onSub }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode;
  tabs?: ModuleTab[]; active?: string; onTab?: (v: string) => void;
  subTabs?: ModuleTab[]; subActive?: string; onSub?: (v: string) => void;
}) {
  return (
    <header className="mh">
      {(title) && (
        <div className="mh-top">
          <div className="mh-id">
            {title && <h1>{title}</h1>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="mh-actions">{actions}</div>}
        </div>
      )}
      {tabs && tabs.length > 0 && active !== undefined && onTab && (
        <div className="mh-tabrow">
          <VwSegmented size="small" value={active} onChange={onTab} options={tabs} className="mh-tabs" />
          {!title && actions && <div className="mh-actions">{actions}</div>}
        </div>
      )}
      {subTabs && subTabs.length > 1 && subActive !== undefined && onSub && (
        <div className="mh-sub" role="tablist">
          {subTabs.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={t.value === subActive} className={t.value === subActive ? 'is-active' : undefined} onClick={() => onSub(t.value)}>{t.label}</button>
          ))}
        </div>
      )}
    </header>
  );
}
export default ModuleHeader;
