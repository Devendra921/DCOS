/* Window: the booked maintenance window, and a form to book or move it. The proposal is checked against
   freezes and other work before it is booked; "Suggest" finds the next free change night. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, DatePicker, Input, InputNumber } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarCheck, CalendarClock, Sparkles } from 'lucide-react';
import { Btn, Chip, Field, Panel } from '../../../../ops/ui/kit';
import { freezeFor } from '../../../delivery/lib/chain';
import { useChainActions } from '../../../delivery/lib/workflowChain';
import { clashes, nextFreeWindow } from '../../../planner/lib/impact';
import { fmtDay, fmtHours, fmtTime, fmtWhen, siteLabel } from '../../lib/model';
import { KvList, Muted } from '../kit';
import type { ChangeView } from './shared';

const BOOKABLE = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled'];

export function WindowTab({ v }: { v: ChangeView }) {
  const { c, ch, row, pd, d, rackIds, deviceIds } = v;
  const actions = useChainActions();
  const { message } = App.useApp();
  const initialHours = row.start && row.end ? Math.max(1, Math.round((new Date(row.end).getTime() - new Date(row.start).getTime()) / 3600e3)) : 4;
  const [start, setStart] = useState<Dayjs | null>(row.start ? dayjs(row.start) : null);
  const [hours, setHours] = useState<number>(initialHours);
  const [impact, setImpact] = useState<string>(ch.window?.impact ?? c.impactSummary ?? '');
  const bookable = BOOKABLE.includes(c.status);
  const others = useMemo(() => ({ ...pd, maintenanceWindows: pd.maintenanceWindows.filter(w => w.changeRequestId !== c.id), changeRequests: pd.changeRequests.filter(x => x.id !== c.id) }), [pd, c.id]);

  const proposal = start ? { start: start.toISOString(), end: start.add(hours, 'hour').toISOString() } : undefined;
  const pClash = useMemo(() => proposal ? clashes(others, { dataCenterId: row.site?.id, deviceIds, rackIds, ...proposal }) : [], [others, proposal?.start, proposal?.end, row.site?.id, deviceIds, rackIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const pFreeze = proposal ? freezeFor(d, row.site?.id, proposal.start, proposal.end) : undefined;
  const blocking = pClash.filter(x => x.severity === 'block');
  const changed = proposal && (proposal.start !== row.start || proposal.end !== row.end || impact !== (ch.window?.impact ?? ''));

  const suggest = () => {
    const w = nextFreeWindow(others, { dataCenterId: row.site?.id, deviceIds, rackIds, hours, after: new Date(Date.now() + 86400e3).toISOString() });
    let s = dayjs(w.start);
    // Skip freezes the planner helper does not know about (only emergency changes may go in a freeze).
    for (let i = 0; i < 60 && row.cls !== 'Emergency' && freezeFor(d, row.site?.id, s.toISOString(), s.add(hours, 'hour').toISOString()); i++) {
      const f = freezeFor(d, row.site?.id, s.toISOString(), s.add(hours, 'hour').toISOString())!;
      const after = new Date(f.end).toISOString();
      const nw = nextFreeWindow(others, { dataCenterId: row.site?.id, deviceIds, rackIds, hours, after });
      s = dayjs(nw.start);
    }
    setStart(s);
    message.info(`Suggested ${fmtWhen(s.toISOString())}: the next change night with no clash${row.cls !== 'Emergency' ? ' and no freeze' : ''}.`);
  };
  const book = () => {
    if (!proposal) return;
    actions.scheduleChange(c.id, proposal.start, proposal.end, impact.trim() || 'No customer impact expected');
    message.success(row.start ? 'Window moved' : 'Window booked');
  };

  return (
    <div className="grid g-2">
      <Panel title="Booked window" icon={CalendarCheck}
        foot={<span>Change nights are Tuesday to Thursday and Saturday from 22:00 UTC. <Link to="/changes?tab=calendar">Open the calendar</Link> to see other work at the site.</span>}>
        {!row.start ? <p className="vw-label" style={{ margin: 0 }}>No window is booked yet. Book one on the right; the work order is planned into the same window.</p> : (
          <KvList columns={2} items={[
            { label: 'Starts', value: `${fmtDay(row.start)} ${fmtTime(row.start)}` },
            { label: 'Ends', value: `${fmtDay(row.end)} ${fmtTime(row.end)}` },
            { label: 'Length', value: fmtHours(row.start, row.end) },
            { label: 'Site', value: row.site ? `${siteLabel(row.site)} · ${row.site.name}` : '—' },
            { label: 'Window record', value: ch.window ? `${ch.window.id} (${ch.window.status})` : 'Not created yet; it is created when the window is booked here' },
            { label: 'Impact stated', value: ch.window?.impact || '—' },
            { label: 'Freeze', value: row.freeze ? `In "${row.freeze.name}"` : 'None' },
          ]} />
        )}
      </Panel>

      <Panel title={row.start ? 'Move the window' : 'Book a window'} icon={CalendarClock}>
        {!bookable ? <p className="vw-label" style={{ margin: 0 }}>The window can no longer be changed: the change is {c.status === 'InProgress' ? 'in progress' : c.status.toLowerCase()}.</p> : (
          <div className="col" style={{ gap: 12 }}>
            {c.status !== 'Approved' && c.status !== 'Scheduled' && <p className="vw-label" style={{ margin: 0 }}>The change is not approved yet, so the window is provisional until it is.</p>}
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
              <Field label="Start"><DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="D MMM YYYY HH:mm" value={start} onChange={setStart} style={{ width: '100%' }} /></Field>
              <Field label="Hours"><InputNumber min={1} max={72} value={hours} onChange={x => setHours(Number(x) || 1)} style={{ width: '100%' }} /></Field>
            </div>
            <Field label="Impact during the window"><Input value={impact} onChange={e => setImpact(e.target.value)} placeholder="e.g. No customer impact; one PDU feed at a time" /></Field>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Btn icon={Sparkles} onClick={suggest}>Suggest next free window</Btn>
              <Btn variant="filled" disabled={!proposal || !changed || blocking.length > 0 || (!!pFreeze && row.cls !== 'Emergency')} onClick={book}>{row.start ? 'Move window' : 'Book window'}</Btn>
            </div>
            {proposal && (
              <div className="col" style={{ gap: 6, marginTop: 4 }}>
                <Muted>Check of {fmtWhen(proposal.start)} to {fmtTime(proposal.end)}</Muted>
                {pFreeze ? <div className="row" style={{ gap: 6 }}><Chip tone={row.cls === 'Emergency' ? 'warning' : 'error'} dot>Freeze</Chip> <Muted>{pFreeze.name}: {row.cls === 'Emergency' ? 'allowed as an emergency' : 'pick another time or raise as an emergency'}</Muted></div> : <div><Chip tone="success" dot>No freeze</Chip></div>}
                {pClash.length === 0 ? <div className="row" style={{ gap: 6 }}><Chip tone="success" dot>No clash</Chip> <Muted>with other work at {siteLabel(row.site)}</Muted></div> : pClash.map(x => (
                  <div key={`${x.kind}-${x.id}`} className="row" style={{ gap: 6 }}><Chip tone={x.severity === 'block' ? 'error' : 'warning'} dot>{x.severity === 'block' ? 'Clash' : 'Check'}</Chip> <Muted>{x.kind === 'change' ? <Link to={`/changes/${x.id}`}>{x.id}</Link> : x.id} {x.title}{x.sharedResources.length ? `, shares ${x.sharedResources.slice(0, 3).join(', ')}` : ', same time at the site'}</Muted></div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
