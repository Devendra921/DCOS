/* Process: the P05 change process (BPMN) when an instance runs for this change; otherwise where the
   change sits in its project's process, and a way to start P05 for a standalone change. */
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { VwCard } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { ProcessPanel } from '../../../workorders/components/ProcessPanel';
import { useEngineActions } from '../../../workorders/lib/useWorkflows';
import type { ChangeView } from './shared';

export function ProcessTab({ v }: { v: ChangeView }) {
  const { c, ch } = v;
  const engine = useEngineActions();
  const { message } = App.useApp();
  const projectProcess = ch.project ? v.d.processInstances.filter(i => i.recordType === 'project' && i.recordId === ch.project!.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined;

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {ch.process ? (
        <ProcessPanel recordType="changeRequest" recordId={c.id} businessKey={c.id} title={c.title} dataCenterId={c.dataCenterId} height={320} />
      ) : (
        <VwCard title="P05 change process">
          <div className="vw-flex vw-items-center vw-justify-between vw-gap-md vw-wrap">
            <div className="vw-card-description">No change process instance runs for this change. {ch.project ? 'Its approvals and window are tracked on this page and its work runs inside the project process.' : 'Start P05 to run its approval, scheduling and review as a BPMN process.'}</div>
            <Button onClick={async () => { await engine.startInstance('change', c.id, { recordType: 'changeRequest', recordId: c.id, dataCenterId: c.dataCenterId, title: c.title }); message.success('Change process P05 started'); }}>Start P05 change process</Button>
          </div>
        </VwCard>
      )}
      {ch.project && (
        <VwCard title="Project process">
          <div className="vw-card-description">
            This change belongs to project <Link to={`/delivery/projects/${ch.project.id}`}>{ch.project.name}</Link>{c.projectStepId ? `, raised at step ${c.projectStepId}` : ''}.{' '}
            {projectProcess ? <>The project runs <Link to={`/workorders/instances/${projectProcess.id}`}>process {projectProcess.id}</Link>; the step waits until this change is implemented.</> : 'The project has no process instance yet.'}
          </div>
        </VwCard>
      )}
    </div>
  );
}
