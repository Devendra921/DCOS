import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Calendar, Col, Empty, Row, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { VwCard, VwChip } from '../../../shared/components/ux';
import type { Milestone, ChangeRequest, Project } from '../../../mock/data/types';

const { Text } = Typography;

type EvKind = 'Change' | 'Go-live' | 'Milestone';
interface CalEvent { date: string; kind: EvKind; label: string; sub?: string; to: string }
const kindBadge: Record<EvKind, 'processing' | 'success' | 'warning'> = { Change: 'processing', 'Go-live': 'success', Milestone: 'warning' };
const kindColor: Record<EvKind, string> = { Change: '#2563eb', 'Go-live': 'var(--vw-color-green-600)', Milestone: '#f59e0b' };

/** Change & delivery calendar — scheduled change requests, go-lives and milestones
 *  plotted on a month grid. Click a day to see its events; click an event to open it.
 *  `embedded` drops the page title/padding so it can sit inside another card. */
export default function DeliveryCalendar({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState<Dayjs>(dayjs());
  const milestones = (useEntityList('milestones', { pageSize: 3000 }).data?.data ?? []) as unknown as Milestone[];
  const crs = (useEntityList('changeRequests', { pageSize: 3000 }).data?.data ?? []) as unknown as ChangeRequest[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const byDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const push = (e: CalEvent) => { (map[e.date] = map[e.date] ?? []).push(e); };
    milestones.forEach((mi) => {
      if (!mi.dueDate) return;
      const goLive = /go-live|live|handover/i.test(mi.name);
      push({ date: dayjs(mi.dueDate).format('YYYY-MM-DD'), kind: goLive ? 'Go-live' : 'Milestone', label: mi.name, sub: projName[mi.projectId], to: `/delivery/projects/${mi.projectId}` });
    });
    crs.forEach((c) => {
      if (!c.scheduledStart) return;
      if (!['Submitted', 'Approved', 'Scheduled', 'InProgress'].includes(c.status)) return;
      push({ date: dayjs(c.scheduledStart).format('YYYY-MM-DD'), kind: 'Change', label: c.title, sub: c.type, to: `/change/${c.id}` });
    });
    return map;
  }, [milestones, crs, projName]);

  const selKey = sel.format('YYYY-MM-DD');
  const dayEvents = byDate[selKey] ?? [];
  const monthCount = useMemo(() => {
    const mk = sel.format('YYYY-MM');
    return Object.entries(byDate).filter(([d]) => d.startsWith(mk)).reduce((n, [, evs]) => n + evs.length, 0);
  }, [byDate, sel]);

  const cellRender = (current: Dayjs, info: { type: string }) => {
    if (info.type !== 'date') return null;
    const evs = byDate[current.format('YYYY-MM-DD')] ?? [];
    if (!evs.length) return null;
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {evs.slice(0, 3).map((e, i) => (
          <li key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Badge status={kindBadge[e.kind]} text={<span style={{ fontSize: "var(--vw-font-label-xs)" }}>{e.label}</span>} />
          </li>
        ))}
        {evs.length > 3 && <li className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)" }}>+{evs.length - 3} more</li>}
      </ul>
    );
  };

  const body = (
    <>
      <Space className="vw-card-section" style={{ display: 'flex', justifyContent: embedded ? 'flex-end' : 'space-between', width: '100%', marginBottom: "var(--vw-space-xxs)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }} align="start">
        {!embedded && (
          <div>
            <div className="vw-page-title" role="heading" aria-level={3}>Change &amp; Delivery Calendar</div>
          </div>
        )}
        <Space>
          <Badge color={kindColor.Change} text="Change" />
          <Badge color={kindColor['Go-live']} text="Go-live" />
          <Badge color={kindColor.Milestone} text="Milestone" />
        </Space>
      </Space>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-md)" }}>
        <Col xs={24} lg={17}>
          <VwCard size="small" bodyStyle={{ padding: "var(--vw-space-sm)" }}>
            <Calendar value={sel} onSelect={(d) => setSel(d)} onPanelChange={(d) => setSel(d)} cellRender={cellRender} />
          </VwCard>
        </Col>
        <Col xs={24} lg={7}>
          <VwCard size="small" title={sel.format('ddd, D MMM YYYY')} extra={<Text type="secondary">{monthCount} this month</Text>}>
            {dayEvents.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing scheduled this day" /> : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {dayEvents.map((e, i) => (
                  <div key={i} onClick={() => navigate(e.to)} style={{ cursor: 'pointer', borderLeft: `3px solid ${kindColor[e.kind]}`, paddingLeft: 10 }}>
                    <Space size={6}><VwChip color={e.kind === 'Change' ? 'blue' : e.kind === 'Go-live' ? 'green' : 'gold'}>{e.kind}</VwChip></Space>
                    <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 500 }}>{e.label}</div>
                    {e.sub && <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{e.sub}</div>}
                  </div>
                ))}
              </Space>
            )}
          </VwCard>
        </Col>
      </Row>
    </>
  );
  return embedded ? body : <div>{body}</div>;
}
