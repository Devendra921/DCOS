/* eslint-disable react-refresh/only-export-components -- route table + public module API */
/* Work orders (Camunda BPMN processes) — route table. Pages live under ./pages. */
import type { RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

const Catalogue = lazy(() => import('./pages/CataloguePage'));
const Instances = lazy(() => import('./pages/InstancesPage'));
const InstanceView = lazy(() => import('./pages/InstancePage'));
const Tasks = lazy(() => import('./pages/TasksPage'));
const Kpis = lazy(() => import('./pages/KpisPage'));
const Rules = lazy(() => import('./pages/RulesPage'));

const wrap = (el: React.ReactNode) => <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>}>{el}</Suspense>;

export const WorkOrdersRoutes: RouteObject[] = [
  { path: 'workorders', element: wrap(<Catalogue />) },
  { path: 'workorders/processes/:key', element: wrap(<Catalogue />) },
  { path: 'workorders/instances', element: wrap(<Instances />) },
  { path: 'workorders/instances/:id', element: wrap(<InstanceView />) },
  { path: 'workorders/tasks', element: wrap(<Tasks />) },
  { path: 'workorders/kpis', element: wrap(<Kpis />) },
  { path: 'workorders/rules', element: wrap(<Rules />) },
];

/** Embeddable work-order panel for record pages (incident, change, project, site …) and the hook behind it. */
export { ProcessPanel } from './components/ProcessPanel';
export type { ProcessPanelProps } from './components/ProcessPanel';
export { useProcessFor, useEngineActions } from './lib/useWorkflows';
