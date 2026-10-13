import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import CapacityHubPage from './CapacityHubPage';
import PowerCoolingPage from './PowerCoolingPage';
import ComputeCapacityPage from './ComputeCapacityPage';
import SpaceReservationsPage from './SpaceReservationsPage';
import { PueSustainabilityPreview } from '../../futurestate';
export default function CapacityTabs() {
  return <TabbedHub title="Capacity" description="Power, cooling, space and compute headroom, with forecasts and reservations." tabs={[
    { label: 'Overview', path: '/capacity', el: <CapacityHubPage /> },
    { label: 'Power & Cooling', path: '/capacity/power', el: <PowerCoolingPage /> },
    { label: 'Compute & GPU', path: '/capacity/compute', el: <ComputeCapacityPage /> },
    { label: 'Space & Reservations', path: '/capacity/space', el: <SpaceReservationsPage /> },
    { label: 'PUE & Sustainability', path: '/capacity/pue', el: <PueSustainabilityPreview /> },
  ]} />;
}
