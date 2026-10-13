/* Process: the P05 change process (BPMN) when an instance runs for this change; otherwise where the
   change sits in its project's process, and a way to start P05 for a standalone change. */
import { stepNameFor } from '../../../delivery/lib/projectProcess';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import { FolderKanban, Play, Workflow } from 'lucide-react';
import { Btn, Panel } from '../../../../ops/ui/kit';
import { ProcessPanel } from '../../../workorders/components/ProcessPanel';
import { useEngineActions } from '../../../workorders/lib/useWorkflows';
import type { ChangeView } from './shared';

export function ProcessTab({ v }: { v: ChangeView }) {
  const { c, ch } = v;
  const engine = useEngineActions();
  const { message } = App.useApp();
  const projectProcess = ch.project ? v.d.processInstances.filter(i => i.recordType === 'project' && i.recordId === ch.project!.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined;

  return (
    <>
      {ch.process ? (
        <ProcessPanel recordType="changeRequest" recordId={c.id} businessKey={c.id} title={c.title} dataCenterId={c.dataCenterId} height={320} />
      ) : (
        <Panel title="P05 change process" icon={Workflow}
          actions={<Btn icon={Play} onClick={async () => { await engine.startInstance('change', c.id, { recordType: 'changeRequest', recordId: c.id, dataCenterId: c.dataCenterId, title: c.title }); message.success('Change process P05 started'); }}>Start P05 change process</Btn>}>
          <p className="vw-label" style={{ margin: 0 }}>No change process instance runs for this change. {ch.project ? 'Its approvals and window are tracked on this page and its work runs inside the project process.' : 'Start P05 to run its approval, scheduling and review as a BPMN process.'}</p>
        </Panel>
      )}
      {ch.project && (
        <Panel title="Project process" icon={FolderKanban}>
          <p style={{ margin: 0 }}>
            This change belongs to project <Link to={`/delivery/projects/${ch.project.id}`}>{ch.project.name}</Link>{c.projectStepId ? `, raised at the step "${stepNameFor(ch.project.template, c.projectStepId)}"` : ''}.{' '}
            {projectProcess ? <>The project runs <Link to={`/workorders/instances/${projectProcess.id}`}>process {projectProcess.id}</Link>; the step waits until this change is implemented.</> : 'The project has no process instance yet.'}
          </p>
        </Panel>
      )}
    </>
  );
}
