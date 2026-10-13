import DigitalTwinPage from '../../twin/pages/DigitalTwinPage';

/** Topology — a Command Center workspace view (reached via the top switcher).
 *  A single Network Topology graph; the former app-layer "Data Flow & Impact"
 *  tab was removed (no application-dependency data to compute it honestly). */
export default function IntelligenceTabs() {
  return <DigitalTwinPage />;
}
