import { createContext } from 'react';

/** A module owns the page heading; the selected view owns its body. */
export const ModulePageContext = createContext<{ overview: boolean } | null>(null);
