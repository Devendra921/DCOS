/** Module frame: the OpsPage header (title, description, actions) with the section switcher shared by every Work orders page. */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Seg } from '../../../ops/ui/kit';
import '../workorders.css';

const SECTIONS = [
  { id: '/workorders', label: 'Processes' },
  { id: '/workorders/instances', label: 'Work orders' },
  { id: '/workorders/tasks', label: 'My tasks' },
  { id: '/workorders/kpis', label: 'KPIs' },
  { id: '/workorders/rules', label: 'Rules' },
];

export function WorkOrdersPage({ title, description, extra, children }: { title: ReactNode; description?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = pathname.startsWith('/workorders/instances') ? '/workorders/instances'
    : pathname.startsWith('/workorders/tasks') ? '/workorders/tasks'
    : pathname.startsWith('/workorders/kpis') ? '/workorders/kpis'
    : pathname.startsWith('/workorders/rules') ? '/workorders/rules' : '/workorders';
  return (
    <OpsPage title={title} description={description}
      actions={<>{extra}<Seg size="sm" value={active} onChange={(v) => navigate(v)} options={SECTIONS} /></>}>
      {children}
    </OpsPage>
  );
}
