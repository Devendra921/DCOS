import { useEffect } from 'react';

/* Cards side by side share a row height. A card that is just a list (bar list, table,
   key/value rows) shouldn't set that height and leave a chart beside it sitting over
   a blank strip: the list is capped to the height of the tallest fixed-size card in
   its row (a chart, donut, matrix…) and scrolls inside its own card. */
const LIST = ':scope > .panel-body > :is(ul.bl, .dt, .col, .wf-scroll, .expo-list):only-child';
const GRIDS = '.grid, .dcim-power-grid';
const MIN = 260;
/* A list only a little taller than the chart beside it is shown in full (the row grows
   a little) rather than cut off; only clearly longer lists scroll. */
const SLACK = 100;

function balance() {
  document.querySelectorAll<HTMLElement>(GRIDS).forEach((grid) => {
    const panels = [...grid.children].filter((c): c is HTMLElement => c instanceof HTMLElement && (c.classList.contains('panel') || c.classList.contains('vw-card-section')) && !c.classList.contains('is-master'));
    if (panels.length < 2 || grid.querySelector(':scope > .is-master')) return;
    panels.forEach((p) => { p.style.maxHeight = ''; });
    const prev = grid.style.getPropertyValue('align-items'), prevPri = grid.style.getPropertyPriority('align-items');
    grid.style.setProperty('align-items', 'start', 'important');
    const rows = new Map<number, { p: HTMLElement; h: number; list: boolean }[]>();
    panels.forEach((p) => {
      const top = Math.round(p.getBoundingClientRect().top);
      rows.set(top, [...(rows.get(top) ?? []), { p, h: p.offsetHeight, list: !!p.querySelector(LIST) }]);
    });
    if (prev) grid.style.setProperty('align-items', prev, prevPri); else grid.style.removeProperty('align-items');
    rows.forEach((row) => {
      if (row.length < 2) return;
      const fixed = row.filter((x) => !x.list);
      if (!fixed.length) return;
      const target = Math.max(MIN, ...fixed.map((x) => x.h));
      const capped = row.filter((x) => x.list && x.h > target + SLACK);
      if (!capped.length) return;
      /* The row ends where its tallest uncapped card ends, so a capped list matches it exactly. */
      const rowH = Math.max(target, ...row.filter((x) => !capped.includes(x)).map((x) => x.h));
      capped.forEach((x) => { x.p.style.maxHeight = `${rowH}px`; });
    });
  });
}

export function useBalancedRows() {
  useEffect(() => {
    let t = 0;
    const schedule = () => { window.clearTimeout(t); t = window.setTimeout(balance, 120); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => { window.clearTimeout(t); mo.disconnect(); window.removeEventListener('resize', schedule); };
  }, []);
}
