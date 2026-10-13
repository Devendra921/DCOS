import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import CircuitsListPage from './CircuitsListPage';
import ProvidersPage from './ProvidersPage';
import CircuitTypesPage from './CircuitTypesPage';

export default function CircuitsTabs() {
  return <TabbedHub tabs={[
    { label: 'Circuits', path: '/circuits', el: <CircuitsListPage /> },
    { label: 'Providers', path: '/circuits/providers', el: <ProvidersPage /> },
    { label: 'Circuit types', path: '/circuits/types', el: <CircuitTypesPage /> },
  ]} />;
}
