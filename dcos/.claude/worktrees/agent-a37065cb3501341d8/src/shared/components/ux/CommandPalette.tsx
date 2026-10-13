/**
 * CommandPalette — Cmd/Ctrl + K global search and action launcher.
 *
 * Per findings.md §4.1 + ui-uxenhancment.md HP-14: every modern enterprise
 * platform has Cmd-K; ours didn't until now. The palette accepts a flat
 * list of `CommandItem` registered by the app shell — typically a union of:
 *   - Route shortcuts (Sites, Programs, Reports, etc.)
 *   - Recent records (last 10 visited)
 *   - Pinned views
 *   - System actions ("Run vendor scoring batch", "Open RAN topology")
 *
 * The component owns no data — it's a controlled overlay. Wire via the
 * `useCommandPalette()` hook (see uses of `import { CommandPalette }` in
 * AppLayout).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { SearchOutlined, EnterOutlined } from '../../icons';
import { UX } from './uxTokens';
import { ELEVATION_GLASS } from './uxSurfaces';
import { TRANSITION } from './uxMotion';

export interface CommandItem {
  /** Unique id. */
  id: string;
  /** Display label. */
  label: string;
  /** Secondary text (e.g. "Site · HUBSITE-0001"). */
  hint?: string;
  /** Group heading (e.g. "Routes", "Recent", "Actions"). */
  group?: string;
  /** Icon to render at the left. */
  icon?: React.ReactNode;
  /** Keyboard shortcut display (e.g. "⌘K"). */
  shortcut?: string;
  /** Invoke when selected. */
  onSelect: () => void;
  /** Plain-text keywords for matching (label + hint already matched). */
  keywords?: string;
}

export interface CommandPaletteProps {
  /** All registerable commands. */
  items: CommandItem[];
  /** Open state — controlled. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Placeholder text. */
  placeholder?: string;
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 - (t.indexOf(q) * 0.5);
  // simple subsequence score
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { score += 1; qi++; }
  }
  return qi === q.length ? score : 0;
}

export function CommandPalette({ items, open, onOpenChange, placeholder = 'Search sites, programs, vendors, actions… (⌘K)' }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Slight delay so input is mounted
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Global key handler — Cmd-K to open, Esc to close, arrows to navigate, Enter to select
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (open && e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const ranked = useMemo(() => {
    if (!query.trim()) {
      return items.slice(0, 12);
    }
    return items
      .map((it) => {
        const score = Math.max(
          fuzzyMatch(query, it.label),
          fuzzyMatch(query, it.hint ?? ''),
          fuzzyMatch(query, it.keywords ?? ''),
        );
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.it);
  }, [query, items]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    for (const it of ranked) {
      const g = it.group ?? 'Results';
      const arr = groups.get(g) ?? [];
      arr.push(it);
      groups.set(g, arr);
    }
    return Array.from(groups.entries());
  }, [ranked]);

  // Reset active idx when results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(ranked.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = ranked[activeIdx];
      if (item) {
        item.onSelect();
        onOpenChange(false);
      }
    }
  }, [ranked, activeIdx, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => onOpenChange(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 1000,
        animation: 'ux-fade-in 180ms cubic-bezier(0, 0, 0.2, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ELEVATION_GLASS,
          width: 'min(640px, 90vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: `1px solid ${UX.border}`,
        }}>
          <SearchOutlined style={{ color: UX.muted, fontSize: "var(--vw-font-heading-md)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: "var(--vw-font-heading-md)",
              color: UX.slate,
            }}
          />
          <kbd style={{
            fontFamily: 'inherit',
            fontSize: "var(--vw-font-label-xs)",
            color: UX.muted,
            border: `1px solid ${UX.border}`,
            padding: '2px 5px',
            borderRadius: "var(--vw-radius-xs)",
            background: 'rgba(255,255,255,0.5)',
          }}>esc</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {grouped.length === 0 && (
            <div style={{ padding: "var(--vw-space-2xl)", textAlign: 'center', color: UX.muted, fontSize: "var(--vw-font-label-md)" }}>
              No matches for "{query}"
            </div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group}>
              <div style={{
                padding: '6px 16px 4px',
                fontSize: "var(--vw-font-label-xs)",
                fontWeight: 600,
                color: UX.muted,
              }}>{group}</div>
              {list.map((it) => {
                const flatIdx = ranked.indexOf(it);
                const active = flatIdx === activeIdx;
                return (
                  <button
                    key={it.id}
                    onClick={() => { it.onSelect(); onOpenChange(false); }}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 16px',
                      border: 'none',
                      background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
                      color: UX.slate,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: "var(--vw-font-label-md)",
                      transition: TRANSITION.hover,
                      borderLeft: active ? `3px solid ${UX.blue}` : '3px solid transparent',
                    }}
                  >
                    <span style={{ color: active ? UX.blue : UX.muted, fontSize: "var(--vw-font-label-md)", width: 18, display: 'inline-flex', justifyContent: 'center' }}>
                      {it.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 500 }}>{it.label}</span>
                      {it.hint && (
                        <span style={{ display: 'block', fontSize: "var(--vw-font-label-xs)", color: UX.muted }}>{it.hint}</span>
                      )}
                    </span>
                    {it.shortcut && (
                      <kbd style={{
                        fontFamily: 'inherit',
                        fontSize: "var(--vw-font-label-xs)",
                        color: UX.muted,
                        border: `1px solid ${UX.border}`,
                        padding: '2px 5px',
                        borderRadius: "var(--vw-radius-xs)",
                        background: '#fff',
                      }}>{it.shortcut}</kbd>
                    )}
                    {active && <EnterOutlined style={{ color: UX.muted, fontSize: "var(--vw-font-label-xs)" }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px',
          borderTop: `1px solid ${UX.border}`,
          display: 'flex',
          gap: "var(--vw-space-lg)",
          fontSize: "var(--vw-font-label-xs)",
          color: UX.muted,
        }}>
          <span><kbd style={{ fontFamily: 'inherit', fontSize: 9, padding: '1px 4px', border: `1px solid ${UX.border}`, borderRadius: 3 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: 'inherit', fontSize: 9, padding: '1px 4px', border: `1px solid ${UX.border}`, borderRadius: 3 }}>↵</kbd> select</span>
          <span style={{ marginLeft: 'auto' }}>DCOS · ⌘K</span>
        </div>
      </div>
    </div>
  );
}
