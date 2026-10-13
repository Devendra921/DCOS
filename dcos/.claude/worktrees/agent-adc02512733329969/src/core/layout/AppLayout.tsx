import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Select, Badge, Typography, Space, theme, Tooltip, ConfigProvider, Input, Popover, Empty } from 'antd';
import { VwButton as Button } from '../../shared/components/vw/VwButton';

import { MenuOutlined, BellOutlined, UserOutlined, LogoutOutlined, SwapOutlined, SearchOutlined, EyeOutlined, CheckOutlined, AuditOutlined, ReadOutlined, InfoCircleOutlined } from '../../shared/icons';
import { useAuth } from '../auth/AuthContext';
import { menuItems, type MenuItem, INT_DISABLED_LIVE } from './menuConfig';
import { SHOW_CHROME } from './chromeMode';
import { CommandPalette, type CommandItem, UX } from '../../shared/components/ux';
import { usePerspective, adaptMenu, PerspectiveSwitcher } from '../perspective';
import CopilotFab from '../../app/CopilotFab';
import { useHelpRail, HelpRailPanel, HelpRailModal } from '../docs/HelpRail';
import { SynopsisProvider } from '../docs/SynopsisContext';
import { db } from '../../mock/db';
import { useEntityList } from '../../shared/hooks/useEntityCRUD';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../mock/data/dcTypes';
import type { DataCenter } from '../../mock/data/types';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Small inline badge marking a menu item as a screen onto a pre-built module.
// The system of record lives outside the rollout platform.
// Sized so it reads clearly against the light Sider on both parent groups
// (e.g. Field Operations) and leaf items (e.g. Incident Register).
const INTEGRATION_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 8,
  padding: '0 7px',
  fontSize: 11,
  lineHeight: '17px',
  fontWeight: 600,
  color: '#0369a1',
  background: '#e0f2fe',
  border: '1px solid #7dd3fc',
  borderRadius: 4,
  verticalAlign: 'middle',
};

function buildAntdMenuItems(items: MenuItem[], inheritedDisabled = false): any[] {
  return items.map(item => {
    // Propagate `intDisabled` down the tree — if any ancestor is parked,
    // every descendant is also disabled and gets the INT badge. The
    // INT_DISABLED_LIVE master switch in menuConfig bypasses this entirely.
    const isParked = !INT_DISABLED_LIVE && (item.intDisabled === true || inheritedDisabled);

    // Item shows the INT badge if it's a real integration touchpoint OR it
    // is currently parked under the intDisabled flag.
    const showIntBadge = item.integration || isParked;
    const badgeTitle = item.integration
      ? (item.integrationSource ? `Integrated with ${item.integrationSource}` : 'Integrated module')
      : 'Parked — integration target. Flip INT_DISABLED_LIVE in menuConfig.ts to bring back live.';

    // For integration / parked items: lay out label + badge as a flex row so
    // the INT pill stays visible even when the leaf menu item's
    // `.ant-menu-title-content` would otherwise text-overflow:ellipsis the
    // badge into oblivion. The text shrinks (with ellipsis) before the badge does.
    const labelNode = showIntBadge
      ? React.createElement(
          'span',
          {
            className: 'hsc-int-label',
            title: badgeTitle,
            style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' },
          },
          React.createElement(
            'span',
            { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 0 }, key: 'text' },
            item.label,
          ),
          React.createElement('span', { style: { ...INTEGRATION_BADGE_STYLE, flex: '0 0 auto' }, key: 'badge' }, 'INT'),
        )
      : item.tooltip
      ? React.createElement('span', { title: item.tooltip }, item.label)
      : item.label;
    return {
      key: item.key,
      icon: item.icon ? React.createElement(item.icon) : undefined,
      label: labelNode,
      disabled: isParked,
      children: item.children ? buildAntdMenuItems(item.children, isParked) : undefined,
    };
  });
}

function findPathByKey(items: MenuItem[], key: string): string | undefined {
  for (const item of items) {
    if (item.key === key && item.path) return item.path;
    if (item.children) {
      const found = findPathByKey(item.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * True if the given key is `intDisabled` itself or is nested under any
 * ancestor that is. Used to short-circuit navigation for parked modules.
 */
function isKeyIntDisabled(items: MenuItem[], key: string, ancestorDisabled = false): boolean {
  for (const item of items) {
    const here = ancestorDisabled || item.intDisabled === true;
    if (item.key === key) return here;
    if (item.children) {
      const found = isKeyIntDisabled(item.children, key, here);
      if (found) return true;
      // Important: we must keep looking even if this subtree returned false,
      // since the key might live in a sibling branch.
    }
  }
  return false;
}

function findExactKeyByPath(items: MenuItem[], path: string): string[] {
  for (const item of items) {
    if (item.path === path) return [item.key];
    if (item.children) {
      const found = findExactKeyByPath(item.children, path);
      if (found.length) return [item.key, ...found];
    }
  }
  return [];
}

/** Exact path first; otherwise the menu entry with the longest path that prefixes this one
 *  (so /planning/plans/PLN-0001 or /planning/templates highlights Planner). */
function findKeyByPath(items: MenuItem[], path: string): string[] {
  const exact = findExactKeyByPath(items, path);
  if (exact.length) return exact;
  let best: { keys: string[]; len: number } = { keys: [], len: 0 };
  const walk = (list: MenuItem[], trail: string[]) => {
    for (const item of list) {
      const keys = [...trail, item.key];
      if (item.path && item.path !== '/' && path.startsWith(`${item.path}/`) && item.path.length > best.len) best = { keys, len: item.path.length };
      if (item.children) walk(item.children, keys);
    }
  };
  walk(items, []);
  return best.keys;
}

// Flatten the nested menu tree into a flat list of command items for the palette.
function flattenForCommandPalette(items: MenuItem[], parent?: MenuItem): CommandItem[] {
  const out: CommandItem[] = [];
  for (const it of items) {
    if (it.path) {
      out.push({
        id: it.key,
        label: it.label,
        hint: parent ? parent.label : undefined,
        group: parent ? parent.label : 'Top-level',
        icon: it.icon ? React.createElement(it.icon) : null,
        onSelect: () => { /* set in usage below */ },
        keywords: `${it.label} ${parent?.label ?? ''} ${it.moduleCode ?? ''}`.trim(),
      });
    }
    if (it.children) out.push(...flattenForCommandPalette(it.children, it));
  }
  return out;
}

/**
 * Recursively filter the menu tree by a query string. A node is kept if:
 *   - its label or moduleCode matches the query, OR
 *   - any of its descendants match (parent is kept to preserve the path)
 *
 * Returns a NEW tree — does not mutate the input.
 */
function filterMenuTree(items: MenuItem[], query: string): MenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const result: MenuItem[] = [];
  for (const it of items) {
    const labelMatch = it.label.toLowerCase().includes(q);
    const moduleMatch = (it.moduleCode ?? '').toLowerCase().includes(q);
    const tooltipMatch = (it.tooltip ?? '').toLowerCase().includes(q);
    const selfMatch = labelMatch || moduleMatch || tooltipMatch;
    const filteredChildren = it.children ? filterMenuTree(it.children, q) : undefined;
    if (selfMatch) {
      // Keep the whole subtree visible when the parent itself matches.
      result.push({ ...it, children: it.children });
    } else if (filteredChildren && filteredChildren.length > 0) {
      result.push({ ...it, children: filteredChildren });
    }
  }
  return result;
}

/** Collect every key in the tree — used to auto-expand all groups when searching. */
function collectAllKeys(items: MenuItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    out.push(it.key);
    if (it.children) out.push(...collectAllKeys(it.children));
  }
  return out;
}

// Chrome toggle (sidebar + header shell) — see chromeMode.ts for the full rationale.

/* ──────────────────────────────────────────────────────────────────────
 * NotificationBell — wires the header bell to a Popover panel that lists
 * the user's recent notifications from the mock DB. Click a row to mark
 * read; "Mark all read" + "View all" footer actions wire to the same DB.
 * Replaces the inert <Badge count={5}> stub.
 * ────────────────────────────────────────────────────────────────────── */
type Notification = {
  id: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
};

function priorityTone(p: Notification['priority']): { bg: string; fg: string } {
  switch (p) {
    case 'critical': return { bg: '#fee2e2', fg: '#991b1b' };
    case 'high':     return { bg: '#fef3c7', fg: '#92400e' };
    case 'medium':   return { bg: '#dbeafe', fg: '#1e40af' };
    default:         return { bg: '#f1f5f9', fg: '#475569' };
  }
}

const NotificationBell: React.FC<{ userId: string; navigate: ReturnType<typeof useNavigate> }> = ({ userId, navigate }) => {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const notifications = useMemo<Notification[]>(() => {
    void tick; // re-read when tick bumps
    try {
      const all = db.getAllRaw('notifications') as unknown as Notification[];
      // Prefer this user's notifications; fall back to all if nothing matches
      const mine = all.filter((n) => !n.userId || n.userId === userId);
      const pool = mine.length > 0 ? mine : all;
      return pool
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 20);
    } catch {
      return [];
    }
  }, [userId, tick]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markRead = (id: string) => {
    try { db.update('notifications', id, { isRead: true, readAt: new Date().toISOString() }); } catch { /* noop */ }
    setTick((t) => t + 1);
  };
  const markAllRead = () => {
    notifications.forEach((n) => { if (!n.isRead) markRead(n.id); });
  };

  const goToEntity = (n: Notification) => {
    markRead(n.id);
    setOpen(false);
    if (!n.entityId) return;
    if (n.entityType === 'site') navigate(`/sites/${n.entityId}`);
    else if (n.entityType === 'permit') navigate('/sites');
    else if (n.entityType === 'issue') navigate('/issues');
    else if (n.entityType === 'crew') navigate('/crew');
  };

  const panel = (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 48px)', maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 10px', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
        <div>
          <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 700, color: "var(--vw-color-slate-900)" }}>Notifications</div>
          <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}>{unreadCount} unread · {notifications.length} recent</div>
        </div>
        {unreadCount > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 0' }}>
        {notifications.length === 0 ? (
          <Empty description="No notifications yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 0' }} />
        ) : (
          notifications.map((n) => {
            const tone = priorityTone(n.priority);
            return (
              <div
                key={n.id}
                onClick={() => goToEntity(n)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '8px 1fr auto',
                  gap: 10,
                  padding: '10px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: n.isRead ? 'transparent' : '#f8fafc',
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.isRead ? 'transparent' : '#f8fafc'; }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: '50%', marginTop: "var(--vw-space-sm)",
                    background: n.isRead ? '#cbd5e1' : tone.fg,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: "var(--vw-color-slate-900)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-600)", lineHeight: 1.5, marginTop: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                    {n.message}
                  </div>
                  <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)", marginTop: "var(--vw-space-xxs)" }}>
                    {n.createdAt} · {n.entityType ?? 'system'}
                  </div>
                </div>
                <span style={{ background: tone.bg, color: tone.fg, fontSize: "var(--vw-font-label-xs)", fontWeight: 700, padding: '2px 8px', borderRadius: "var(--vw-radius-xs)", height: 'fit-content', marginTop: "var(--vw-space-xxs)" }}>
                  {n.priority}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--vw-color-slate-100)", padding: '8px 4px 2px', textAlign: 'right' }}>
        <Button size="small" type="link" onClick={() => { setOpen(false); navigate('/admin/notifications'); }}>
          View all notifications →
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={panel}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={{ pointAtCenter: true }}
      styles={{ body: { padding: 12 } }}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button type="text" aria-label={`Notifications, ${unreadCount} unread`} icon={<BellOutlined />} style={{ color: open ? '#1d4ed8' : 'inherit' }} />
      </Badge>
    </Popover>
  );
};

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  // Below the `lg` breakpoint the Sider can't coexist with content at a
  // usable width, so it switches to a zero-width, overlay-on-open drawer
  // instead of squeezing content and forcing horizontal scroll.
  const [isMobile, setIsMobile] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, switchUser, users } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  // Scroll the content area to the top on every route change so deep
  // navigations (kebab actions, quick-action buttons) don't land
  // mid-page on the new screen.
  useEffect(() => {
    const el = document.querySelector('main, .ant-layout-content') as HTMLElement | null;
    if (el) el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  // ── Role-Based Perspective — the menu, command palette and density all
  //    adapt to the active perspective. See role-perspective-architecture.md.
  const { perspective, isSimulating, nativePerspective, exitSimulation } = usePerspective();
  // Sites are searchable by name, code, type and segment from the palette.
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const adaptedMenu = useMemo(() => adaptMenu(menuItems, perspective), [perspective]);

  // ── Sidebar menu search — filters the visible menu tree in place. The
  //    Cmd-K palette remains the global jump-anywhere experience; this
  //    is the discoverable "browse + narrow" filter for users staring at
  //    a tall menu and not knowing the exact label.
  const [menuQuery, setMenuQuery] = useState('');
  const filteredMenu = useMemo(
    () => filterMenuTree(adaptedMenu, menuQuery),
    [adaptedMenu, menuQuery],
  );

  const selectedKeys = findKeyByPath(adaptedMenu, location.pathname);

  // User-driven expand/collapse state. Seeded with the path-to-current-route
  // so the active group is open on first mount. AntD writes here via
  // `onOpenChange` whenever the user clicks a parent group title.
  const [userOpenKeys, setUserOpenKeys] = useState<string[]>(() => selectedKeys.slice(0, -1));

  // Keep the user's open-set in sync with route changes — when the user
  // navigates to a deep route via the palette / breadcrumbs, the parents
  // of that route should auto-expand. We merge (not replace) so the user's
  // other manually-opened groups stay open.
  useEffect(() => {
    const ancestors = selectedKeys.slice(0, -1);
    if (ancestors.length === 0) return;
    setUserOpenKeys((prev) => {
      const merged = new Set(prev);
      ancestors.forEach((k) => merged.add(k));
      return Array.from(merged);
    });
    // selectedKeys is derived from location.pathname — depend on the path
    // so this effect runs once per navigation, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // While searching, force every matching group open so results are visible.
  // Otherwise use the user-driven state so click-to-toggle works normally.
  const openKeys = menuQuery.trim()
    ? collectAllKeys(filteredMenu)
    : userOpenKeys;

  // Wire navigate into each command item's onSelect at construction time.
  const commandItems = useMemo<CommandItem[]>(() => {
    const flat = flattenForCommandPalette(adaptedMenu);
    const items: CommandItem[] = flat.map((it) => ({
      ...it,
      onSelect: () => {
        const path = findPathByKey(adaptedMenu, it.id);
        if (path) navigate(path);
      },
    }));
    // Role-aware quick actions first — the active perspective's own shortcuts.
    const quick: CommandItem[] = perspective.quickActions.map((qa, i) => ({
      id: `__qa-${i}`,
      label: qa.label,
      hint: `${perspective.shortLabel} quick action`,
      group: 'For your perspective',
      icon: null,
      onSelect: () => navigate(qa.to),
      keywords: `${qa.label} quick action ${perspective.shortLabel}`,
    }));
    items.unshift(
      ...quick,
      { id: '__home', label: 'Network Overview', hint: 'Your landing screen', group: 'For your perspective', icon: null, onSelect: () => navigate('/'), keywords: 'home dashboard landing network overview' },
    );
    // Sites: "Central Office" finds every CO, "Telco" every telco site, a code or name the site itself.
    for (const d of dcs) {
      const t = dcTypeProfile(d.dcTypeKey);
      items.push({ id: `site-${d.id}`, label: d.name, hint: [d.code, t?.name, d.tier].filter(Boolean).join(' · '), group: 'Sites', icon: null, onSelect: () => navigate(`/facility/dc/${d.id}`), keywords: `site data center ${d.code} ${t?.name ?? ''} ${t?.segment ?? ''} ${t?.key ?? ''} ${d.tier} ${d.status}` });
    }
    // Types: jump to the map filtered to that kind of facility.
    for (const t of DC_TYPE_CATALOG) {
      items.push({ id: `dctype-${t.key}`, label: `${t.name} sites`, hint: `${t.segment} · show on map`, group: 'Data center types', icon: null, onSelect: () => navigate(`/map?type=${t.key}`), keywords: `type ${t.name} ${t.segment} ${t.key} facility` });
    }
    items.push({ id: 'dctypes', label: 'Data center types reference', hint: 'Taxonomy, envelopes and DCOS coverage', group: 'Data center types', icon: null, onSelect: () => navigate('/facility/dc-types'), keywords: 'dc types taxonomy reference catalogue' });
    return items;
  }, [navigate, adaptedMenu, perspective, dcs]);

  const onMenuClick = ({ key }: { key: string }) => {
    // Defensive: even though parked items render with `disabled: true` on
    // the antd Menu (which suppresses the click event), gate here too so a
    // command-palette dispatch or programmatic key click can't bypass it.
    if (!INT_DISABLED_LIVE && isKeyIntDisabled(adaptedMenu, key)) return;
    const path = findPathByKey(adaptedMenu, key);
    if (path) navigate(path);
    // On mobile the Sider is an overlay drawer — close it after navigating
    // so the picked page is actually visible.
    if (isMobile) setCollapsed(true);
  };

  const userMenuItems = [
    {
      key: 'role',
      label: (
        <Space direction="vertical" size={0}>
          <Text strong>{user.roleName}</Text>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{user.operatorName}</Text>
        </Space>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'switch',
      icon: <SwapOutlined />,
      label: (
        <Select placeholder="Select user"
          size="small"
          value={user.id}
          onChange={(v) => switchUser(v)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 200 }}
          options={users.map(u => ({
            value: u.id,
            label: `${u.name} (${u.roleName})`,
          }))}
        />
      ),
    },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout' },
  ];

  // Playbook + Synopsis state — triggered from the header (icon buttons below)
  // in both full-chrome and headless modes, so the feature is never lost
  // when the floating help rail isn't rendered.
  const helpRail = useHelpRail();
  const headerHelpIcons = (
    <>
      <Tooltip title="Playbook — guided tour of the platform">
        <Button type="text" aria-label="Open playbook" icon={<ReadOutlined />} onClick={helpRail.openPlaybook} />
      </Tooltip>
      <Tooltip title="Synopsis — context for this page">
        <Button type="text" aria-label="Toggle page synopsis" icon={<InfoCircleOutlined />} onClick={helpRail.toggleSynopsis} />
      </Tooltip>
    </>
  );

  // ── Headless mode (VITE_SHOW_CHROME=false) ───────────────────────────────
  // Render only the routed content. Host shell is responsible for its own
  // header + sidenav — including the DC-scope selector, which each page
  // renders inline in its own title row (see `DcScopeInline` usages) so it
  // still works with no app-level header at all. We still mount the
  // CommandPalette so Cmd-K works, and we still honor the simulation banner
  // if a perspective is being simulated (it's a state alert, not chrome).
  if (!SHOW_CHROME) {
    return (
      <ConfigProvider componentSize={perspective.density === 'expert' ? 'small' : 'middle'}>
        {/*
          Embed-mode page-spacing rules.

          Goal: every page reads cleanly inside the host shell, regardless
          of whether the page wraps itself in `AMBIENT_BG` (most do — they
          come with 24-28-40 padding) or in a bare `<div style={{ paddingBottom: 24 }}>`
          (some H&S and admin pages don't have any horizontal inset).

          Approach:
            1. On `.ran-headless-outlet` itself — add a baseline 12 × 20 px
               inset so titles and content never butt against the host
               shell's container edge (where clipping/overflow can eat
               the first ~30 px — observed live on Site Safety Plan /
               Documents / Certification Management).
            2. On the FIRST CHILD of the outlet — neutralize the wrapper's
               `min-height: 100vh` and `background` so the host's surface
               shows through. We leave any horizontal padding alone so
               AMBIENT_BG pages keep their richer inset (compounds the
               baseline by a few px — invisible).
            3. Trim the AMBIENT_BG wrapper's vertical padding only — the
               host shell provides its own top/bottom margin; we don't
               need 24+40 px of additional vertical space stacked inside
               the host's content area.

          IMPORTANT: do NOT use `padding: 0 !important` on the wrapper —
          that's what caused the title-clipping in the first place.
        */}
        <style>{`
          /* Embed mode — zero spacing from us. The host template owns
             ALL outer page spacing (margin / padding / background); we
             render content edge-to-edge inside whatever box the host
             gives us.

             What we still neutralize on the page's own outer wrapper:
               • min-height: 0          — page wrappers default to
                                          \`min-height: 100vh\` so they
                                          fill a standalone viewport.
                                          Inside the host that stacks
                                          a second 100vh and creates a
                                          giant blank scroll area.
               • background: transparent — page wrappers carry their own
                                          gradient / surface. We let the
                                          host's surface show through.
               • padding: 20px          — every page's own padding varies
                                          (24/28/40/none — whatever that
                                          page happened to be written
                                          with). Normalize it to one
                                          guaranteed 20px inset here so
                                          content never sits flush against
                                          the host's edge, regardless of
                                          what the page itself set.

             What still works: the page's INNER cards, grids, KPI tiles,
             tables, etc. keep their own internal padding — the rule only
             touches the immediate child of the outlet wrapper. */
          .ran-headless-outlet {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            overflow-x: clip;
          }
          .ran-headless-outlet > :not(.vw-wizard-page) {
            min-height: 0 !important;
            background: transparent !important;
            padding: 20px !important;
            max-width: 100%;
            box-sizing: border-box;
          }
        `}</style>
        <div className="ran-headless-layout" style={{ display: 'flex', flexDirection: 'column' }}>
          {isSimulating && (
            <div style={{ background: "var(--vw-color-amber-100)", borderBottom: "1px solid var(--vw-color-amber-200)", padding: '7px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: "var(--vw-color-amber-800)" }}>
              <EyeOutlined />
              <span>
                <strong>Simulation</strong> — viewing the platform as <strong>{perspective.label}</strong>. Navigation, home screen and density reflect this perspective.
              </span>
              <button
                onClick={exitSimulation}
                style={{ marginLeft: 'auto', background: "var(--vw-color-amber-800)", color: '#fff', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: "var(--vw-font-label-sm)", fontWeight: 600, cursor: 'pointer' }}
              >
                Return to {nativePerspective.shortLabel}
              </button>
            </div>
          )}
          <div className="ran-headless-outlet">
            <Outlet />
          </div>
          <CommandPalette items={commandItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider componentSize={perspective.density === 'expert' ? 'small' : 'middle'}>
    <SynopsisProvider>
    {/* Whole-app shell pinned to the viewport. The outer Layout takes the
        full height and clips overflow so only the inner Content region
        actually scrolls — header and sidebar stay locked in place. */}
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        className="vw-app-navigation"
        collapsible
        trigger={isMobile ? null : undefined}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 60}
        onBreakpoint={(broken) => {
          setIsMobile(broken);
          setCollapsed(broken);
        }}
        width={240}
        theme="light"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          background: "var(--vw-color-white)",
          borderRight: '1px solid #f0f0f0',
          boxShadow: isMobile && !collapsed ? 'var(--shadow-sm)' : 'var(--shadow-resting)',
        }}
      >
        <div style={{ height: 48, margin: "var(--vw-space-md)", display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--vw-color-slate-900)", display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: "var(--vw-font-label-md)" }}>
            DC
          </div>
          {!collapsed && <Text style={{ color: "var(--vw-color-slate-900)", fontSize: "var(--vw-font-heading-md)", fontWeight: 600 }}>DCOS</Text>}
        </div>
        {/*
          antd's .ant-menu-title-content applies overflow:hidden +
          text-overflow:ellipsis, which clips the INT badge on leaf items
          like Incident Register (the badge gets eaten by the "..." before
          it ever paints). For items that contain our custom integration
          label, switch the title-content to inline-flex so the badge sits
          alongside the text and the text alone gets truncated when space
          is tight. Parent submenu items (Field Operations) already lay
          their label out as a flex row, so this only affects leaves.
        */}
        <style>{`
          .ant-menu-item:has(.hsc-int-label) > .ant-menu-title-content,
          .ant-menu-submenu-title:has(.hsc-int-label) > .ant-menu-title-content {
            overflow: visible;
            display: inline-flex;
            align-items: center;
            min-width: 0;
          }
          .hsc-int-label { width: 100%; }
        `}</style>
        {/* Sidebar menu search — type to filter the menu tree in place.
            Matches expand all containing groups automatically. */}
        {!collapsed && (
          <div style={{ padding: '0 12px 8px' }}>
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined style={{ color: UX.muted, fontSize: "var(--vw-font-label-sm)" }} />}
              placeholder="Filter menu…"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setMenuQuery(''); }}
              style={{ fontSize: "var(--vw-font-label-sm)" }}
            />
            {menuQuery.trim() && filteredMenu.length === 0 && (
              <div style={{
                marginTop: "var(--vw-space-sm)",
                padding: '8px 10px',
                fontSize: "var(--vw-font-label-xs)",
                color: UX.muted,
                background: "var(--vw-color-slate-50)",
                border: `1px dashed ${UX.border}`,
                borderRadius: 6,
                textAlign: 'center',
              }}>
                No menu items match "{menuQuery}"
              </div>
            )}
          </div>
        )}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          // Persist user-driven expand/collapse — but only when no search
          // is active. While searching, openKeys is forced to all matches
          // (see `openKeys` derivation above) and user toggles are ignored.
          onOpenChange={(keys) => {
            if (!menuQuery.trim()) {
              setUserOpenKeys(keys as string[]);
            }
          }}
          items={buildAntdMenuItems(filteredMenu)}
          onClick={onMenuClick}
          style={{ borderRight: 'none' }}
        />
      </Sider>
      {/* On mobile the Sider floats over content as a drawer — dim and
          intercept clicks on the rest of the page while it's open so it
          reads as an overlay, not a layout column. */}
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 90 }}
        />
      )}
      <Layout style={{
        // Mobile Sider is zero-width and overlays content, so it never
        // reserves layout space — only the desktop rail/full widths do.
        marginLeft: isMobile ? 0 : (collapsed ? 60 : 240),
        transition: 'margin-left 0.2s',
        background: 'var(--nstPageBackground)',
        // Column flex so Header + Content split the viewport height. Content
        // gets the only scroll; everything above it stays parked at top.
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <Header className="dcos-app-header" style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
          zIndex: 9,
          lineHeight: 'normal',
        }}>
          {/* Global command-palette trigger */}
          <Tooltip title="Search & jump to anything">
            <button
              onClick={() => setPaletteOpen(true)}
              className="dcos-command-trigger"
              aria-label="Open command palette"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: 360,
                maxWidth: '40vw',
                minWidth: 0,
                padding: '6px 12px',
                background: '#f5f7fa',
                border: `1px solid ${UX.border}`,
                borderRadius: "var(--vw-radius-sm)",
                cursor: 'pointer',
                color: UX.muted,
                fontSize: "var(--vw-font-label-md)",
                transition: 'all 150ms cubic-bezier(0.4,0,0.2,1)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = UX.blue; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = UX.border; (e.currentTarget as HTMLButtonElement).style.background = '#f5f7fa'; }}
            >
              <SearchOutlined style={{ fontSize: "var(--vw-font-label-md)" }} />
              <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>Search racks, subnets, changes, devices…</span>
              <kbd style={{
                fontFamily: 'inherit',
                fontSize: "var(--vw-font-label-xs)",
                color: UX.muted,
                border: `1px solid ${UX.border}`,
                padding: '2px 6px',
                borderRadius: "var(--vw-radius-xs)",
                background: '#fff',
              }}>⌘K</kbd>
            </button>
          </Tooltip>
          {/* Below ~640px the full right-side cluster (audit icon, profile
              pill, 2 help icons, notifications, avatar+name) doesn't fit
              next to the search box and silently overflows the header —
              several icons render entirely off-screen with no scrollbar or
              affordance to reach them. The profile pill and the username
              text are purely informational (the avatar dropdown still
              exposes the name), so they're the ones hidden to bring the
              cluster back inside the viewport; every remaining icon stays
              clickable. */}
          <style>{`
            @media (max-width: 640px) {
              .header-perspective-pill, .header-user-name { display: none; }
            }
          `}</style>
          <Space className="dcos-header-actions" size={16} style={{ flexShrink: 0 }}>
            {isMobile && (
              <Button type="text" aria-label={collapsed ? 'Open navigation' : 'Close navigation'} aria-expanded={!collapsed} icon={<MenuOutlined />} onClick={() => setCollapsed(!collapsed)} />
            )}
            <Tooltip title="Consolidated audit log"><Button type="text" aria-label="Open audit log" icon={<AuditOutlined />} onClick={() => navigate('/audit')} /></Tooltip>
            <span className="header-perspective-pill"><PerspectiveSwitcher /></span>
            {headerHelpIcons}
            <NotificationBell userId={user.id} navigate={navigate} />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Space style={{ cursor: 'pointer', flexShrink: 0 }}>
                <Avatar icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
                <Text className="header-user-name" style={{ whiteSpace: 'nowrap' }}>{user.name}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        {isSimulating && (
          <div style={{ background: "var(--vw-color-amber-100)", borderBottom: "1px solid var(--vw-color-amber-200)", padding: '7px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: "var(--vw-color-amber-800)" }}>
            <EyeOutlined />
            <span>
              <strong>Simulation</strong> — viewing the platform as <strong>{perspective.label}</strong>. Navigation, home screen and density reflect this perspective.
            </span>
            <button
              onClick={exitSimulation}
              style={{ marginLeft: 'auto', background: "var(--vw-color-amber-800)", color: '#fff', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: "var(--vw-font-label-sm)", fontWeight: 600, cursor: 'pointer' }}
            >
              Return to {nativePerspective.shortLabel}
            </button>
          </div>
        )}
        {/* Content row: page content scrolls; the help rail/panel are flex
            siblings on the right so opening the Synopsis reflows (not overlays)
            the page. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <Content className="vw-page-container" style={{
            // Owns the scroll. Everything else (Sider, Header, optional
            // simulation banner) is pinned to the viewport.
            // `padding` (not `margin`) on purpose: pages lay out KPI/metric
            // rows with antd's `Row gutter={...}`, which bleeds a negative
            // margin (-gutter/2 on each side) outside its own box by design
            // — normally absorbed by a padded ancestor. With only a margin
            // here there's no padding to absorb it, so that bleed escapes
            // past this scrollable Content's own edge and shows up as a
            // real (if small) horizontal scrollbar on every page that uses
            // Row/gutter, even at ordinary desktop widths. Padding keeps
            // the same visual inset from the Sider/Header while giving the
            // bleed somewhere to go.
            padding: "var(--vw-page-gap)",
            minHeight: 0,
            minWidth: 0,
            flex: 1,
            overflow: 'auto',
          }}>
            <Outlet />
          </Content>
          <HelpRailPanel help={helpRail} />
        </div>
      </Layout>
      {/* Global command palette — Cmd/Ctrl+K */}
      <CommandPalette items={commandItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <HelpRailModal help={helpRail} />
      <CopilotFab />
    </Layout>
    </SynopsisProvider>
    </ConfigProvider>
  );
};
