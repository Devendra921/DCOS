/** Module header: title, description and the section switcher shared by every Work orders page. */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VwSegmented } from '../../../shared/components/ux';

const SECTIONS = [
  { value: '/workorders', label: 'Catalogue' },
  { value: '/workorders/instances', label: 'Work orders' },
  { value: '/workorders/tasks', label: 'My tasks' },
  { value: '/workorders/kpis', label: 'KPIs' },
  { value: '/workorders/rules', label: 'Rules' },
];

export function WorkOrdersHeader({ title, description, extra }: { title: string; description?: ReactNode; extra?: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = pathname.startsWith('/workorders/instances') ? '/workorders/instances'
    : pathname.startsWith('/workorders/tasks') ? '/workorders/tasks'
    : pathname.startsWith('/workorders/kpis') ? '/workorders/kpis'
    : pathname.startsWith('/workorders/rules') ? '/workorders/rules' : '/workorders';
  return (
    <div className="vw-flex vw-justify-between vw-items-center vw-gap-md vw-wrap">
      <div style={{ minWidth: 0 }}>
        <div className="vw-page-title">{title}</div>
        {description && <div className="vw-page-description">{description}</div>}
      </div>
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        {extra}
        <VwSegmented size="small" value={active} onChange={(v) => navigate(v)} options={SECTIONS} />
      </div>
    </div>
  );
}
