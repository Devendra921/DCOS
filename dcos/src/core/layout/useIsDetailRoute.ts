import { useMatches } from 'react-router-dom';

/** True when the active route carries URL params (/:id) — i.e. a detail page, not a list or tab. */
export function useIsDetailRoute(): boolean {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  return !!last && Object.keys(last.params ?? {}).length > 0;
}
