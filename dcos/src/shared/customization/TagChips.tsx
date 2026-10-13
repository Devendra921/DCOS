import { Tooltip } from 'antd';
import { useTags } from './useCustomization';
import { VwChip } from '../components/ux';

/** Render a record's tag ids as coloured chips. */
export function TagChips({ ids, empty = '—' }: { ids?: string[]; empty?: string }) {
  const { byId } = useTags();
  if (!ids || ids.length === 0) return <span className="vw-text-tertiary">{empty}</span>;
  return (
    <span>
      {ids.map((id) => {
        const t = byId[id];
        if (!t) return null;
        return (
          <Tooltip key={id} title={t.description}>
            <VwChip color={t.color} style={{ marginInlineEnd: 4 }}>{t.name}</VwChip>
          </Tooltip>
        );
      })}
    </span>
  );
}
export default TagChips;
