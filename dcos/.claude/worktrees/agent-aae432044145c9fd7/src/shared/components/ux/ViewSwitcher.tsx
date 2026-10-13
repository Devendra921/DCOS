import { useLocation, useNavigate } from 'react-router-dom';
import { VwSegmented } from './VwSegmented';

const VIEWS = [
  { label: 'Command Center', value: '/command-center' },
  { label: 'Map', value: '/map' },
  { label: 'Operations', value: '/operations' },
  { label: 'Topology', value: '/intelligence' },
];

/** RAN-style top-right workspace view switcher. */
export function ViewSwitcher() {
  const loc = useLocation();
  const nav = useNavigate();
  // Match sub-paths too (e.g. /intelligence/flows → Topology) so the right view stays highlighted.
  const active = VIEWS.find((v) => v.value !== '/' && loc.pathname.startsWith(v.value))?.value ?? '/';
  return <VwSegmented size="small" value={active} onChange={(v) => nav(v)} options={VIEWS} />;
}
export default ViewSwitcher;
