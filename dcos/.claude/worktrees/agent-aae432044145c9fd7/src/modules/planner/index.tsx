/* eslint-disable react-refresh/only-export-components */
/* Planner — route table. One menu entry: the hub carries Overview, Plans, Templates, Benchmarks & rules and AI as tabs; Pages live under ./pages; charts under ./components/charts; engine and AI under ./lib. */
import type { RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

const Hub = lazy(() => import('./pages/PlannerHubPage'));
const Wizard = lazy(() => import('./pages/PlanWizardPage'));
const PlanDetail = lazy(() => import('./pages/PlanDetailPage'));

const wrap = (el: React.ReactNode) => <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>}>{el}</Suspense>;

export const PlannerRoutes: RouteObject[] = [
  { path: 'planning', element: wrap(<Hub />) },
  { path: 'planning/plans', element: wrap(<Hub />) },
  { path: 'planning/new', element: wrap(<Wizard />) },
  { path: 'planning/plans/:planId/edit', element: wrap(<Wizard />) },
  { path: 'planning/plans/:planId', element: wrap(<PlanDetail />) },
  { path: 'planning/templates', element: wrap(<Hub />) },
  { path: 'planning/templates/:templateId', element: wrap(<Hub />) },
  { path: 'planning/benchmarks', element: wrap(<Hub />) },
  { path: 'planning/ai', element: wrap(<Hub />) },
];
