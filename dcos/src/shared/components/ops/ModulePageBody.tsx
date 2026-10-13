import type { ReactNode } from 'react';
import { ModulePageContext } from './moduleContext';

export function ModulePageBody({ overview, children }: { overview: boolean; children: ReactNode }) {
  return <ModulePageContext.Provider value={{ overview }}><div className="module-screen">{children}</div></ModulePageContext.Provider>;
}
