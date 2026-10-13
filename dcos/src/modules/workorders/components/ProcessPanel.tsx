/**
 * ProcessPanel — compact embedding of a record's work order (diagram + current step +
 * waiting-on) for incident / change / project / site detail pages.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import type * as T from '../../../mock/data/types';
import { Play, Workflow } from 'lucide-react';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import type { Tone } from '../../../ops/lib/tone';
import { BpmnDiagram } from './BpmnDiagram';
import { taskOverlays } from './overlays';
import { DEFAULT_PROCESS, STATE_LABEL, STATE_TONE, fmtAgo, processName, processPid, useEngineActions, useEngineIncidents, useProcessFor } from '../lib/useWorkflows';

export interface ProcessPanelProps {
  recordType: T.ProcessRecordType;
  recordId: string;
  /** Diagram height (px). */
  height?: number;
  /** Used when starting a new instance from the panel. */
  businessKey?: string;
  title?: string;
  dataCenterId?: string;
}

export function ProcessPanel({ recordType, recordId, height = 320, businessKey, title, dataCenterId }: ProcessPanelProps) {
  const { instance, xml, openTasks, summary, markers } = useProcessFor(recordType, recordId);
  const incidents = useEngineIncidents();
  const actions = useEngineActions();
  const { message } = App.useApp();
  const overlays = useMemo(() => taskOverlays(openTasks, incidents.filter((e) => e.instanceId === instance?.id)), [openTasks, incidents, instance?.id]);

  if (!instance) {
    const key = DEFAULT_PROCESS[recordType];
    return (
      <Panel title="Work order" icon={Workflow}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>No process is running for this record.</span>
          <Btn size="sm" icon={Play} onClick={async () => {
            await actions.startInstance(key, businessKey ?? recordId, { recordType, recordId, dataCenterId, title });
            message.success(`${processName(key)} started`);
          }}>Start {processName(key)}</Btn>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={<span>{processPid(instance.definitionKey)} · {processName(instance.definitionKey)}</span>}
      icon={Workflow}
      actions={<>
        <Chip tone={STATE_TONE[instance.state] as Tone} dot>{STATE_LABEL[instance.state]}</Chip>
        <Link to={`/workorders/instances/${instance.id}`} className="nst-btn nst-btn--action nst-btn--sm">Open work order</Link>
      </>}
    >
      <div className="col" style={{ gap: 10 }}>
        <BpmnDiagram xml={xml} height={height} markers={markers} overlays={overlays} />
        <dl className="wf-kv" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <dt>Current step</dt><dd>{summary?.step}</dd>
          <dt>Waiting on</dt><dd>{summary?.waitingOn}</dd>
          <dt>Started</dt><dd>{fmtAgo(instance.startedAt)}</dd>
        </dl>
      </div>
    </Panel>
  );
}

export default ProcessPanel;
