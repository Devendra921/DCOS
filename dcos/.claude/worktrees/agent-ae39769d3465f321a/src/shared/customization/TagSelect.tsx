import { Select, Tag as AntTag } from 'antd';
import { useTags } from './useCustomization';

/** Multi-select of tags, value = tag ids. Use inside a form or controlled. */
export function TagSelect({ value, onChange, placeholder = 'Add tags…', style }: {
  value?: string[];
  onChange?: (ids: string[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const { tags } = useTags();
  return (
    <Select
      mode="multiple"
      allowClear
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      optionFilterProp="label"
      style={{ minWidth: 240, ...style }}
      options={tags.map((t) => ({ value: t.id, label: t.name }))}
      tagRender={({ label, value: v, closable, onClose }) => {
        const t = tags.find((x) => x.id === v);
        return <AntTag color={t?.color} closable={closable} onClose={onClose} style={{ marginInlineEnd: 4 }}>{label}</AntTag>;
      }}
    />
  );
}
export default TagSelect;
