/* eslint-disable react-refresh/only-export-components */
/* Change module routes. /changes is the one home of change requests; the old /change… paths of the
   former "Change governance" queue redirect here. */
import type { RouteObject } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import ChangesHomePage from './pages/ChangesHomePage';
import ChangeDetailPage from './pages/ChangeDetailPage';
import RaiseChangePage from './pages/RaiseChangePage';

function RedirectOldChange() {
  const { changeId } = useParams();
  return <Navigate to={`/changes/${changeId ?? ''}`} replace />;
}

export const ChangeRoutes: RouteObject[] = [
  { path: 'changes', element: <ChangesHomePage /> },
  { path: 'changes/new', element: <RaiseChangePage /> },
  { path: 'changes/:changeId', element: <ChangeDetailPage /> },
  { path: 'change', element: <Navigate to="/changes" replace /> },
  { path: 'change/approvals', element: <Navigate to="/changes?tab=approvals" replace /> },
  { path: 'change/new', element: <Navigate to="/changes/new" replace /> },
  { path: 'change/:changeId', element: <RedirectOldChange /> },
  { path: 'governance/policies', element: <Navigate to="/changes?tab=policies" replace /> },
];
