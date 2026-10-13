/**
 * ProcessPanel — compact embedding of a record's work order (diagram + current step +
 * waiting-on) for incident / change / project / site detail pages.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { App } from 'antd';
import type * as T from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { VwButton } from '../../../shared/components/vw/VwButton';
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
      <VwCard title="Work order">
        <div className="vw-flex vw-justify-between vw-items-center vw-gap-md vw-wrap">
          <div className="vw-card-description">No process is running for this record.</div>
          <VwButton size="small" onClick={async () => {
            await actions.startInstance(key, businessKey ?? recordId, { recordType, recordId, dataCenterId, title });
            message.success(`${processName(key)} started`);
          }}>Start {processName(key)}</VwButton>
        </div>
      </VwCard>
    );
  }

  return (
    <VwCard
      title={<span>{processPid(instance.definitionKey)} · {processName(instance.definitionKey)}</span>}
      extra={<div className="vw-flex vw-items-center vw-gap-sm">
        <VwChip variant={STATE_TONE[instance.state]}>{STATE_LABEL[instance.state]}</VwChip>
        <Link to={`/workorders/instances/${instance.id}`} className="nst-btn nst-btn--action nst-btn--sm">Open work order</Link>
      </div>}
    >
      <div className="vw-flex vw-flex-col vw-gap-sm">
        <BpmnDiagram xml={xml} height={height} markers={markers} overlays={overlays} />
        <dl className="wf-kv" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <dt>Current step</dt><dd>{summary?.step}</dd>
          <dt>Waiting on</dt><dd>{summary?.waitingOn}</dd>
          <dt>Started</dt><dd>{fmtAgo(instance.startedAt)}</dd>
        </dl>
      </div>
    </VwCard>
  );
}

export default ProcessPanel;
