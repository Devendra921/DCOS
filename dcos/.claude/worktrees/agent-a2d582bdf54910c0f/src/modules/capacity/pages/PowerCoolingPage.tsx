import PowerCapacityPage from './PowerCapacityPage';
import CoolingCapacityPage from './CoolingCapacityPage';

/** Facility kW — operators view power and cooling together. */
export default function PowerCoolingPage() {
  return (
    <div>
      <PowerCapacityPage embedded />
      <div style={{ height: 28 }} />
      <CoolingCapacityPage embedded />
    </div>
  );
}
