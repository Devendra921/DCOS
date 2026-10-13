/** Canonical VW segmented control; selection and callbacks stay unchanged. */

import React from 'react';

export interface VwSegmentedOption<T extends string = string> {
  label: React.ReactNode;
  value: T;
  icon?: React.ReactNode;
}

export interface VwSegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: (VwSegmentedOption<T> | T)[];
  /** Matches antd's size prop — 'small' tightens padding/height/font-size. */
  size?: 'small' | 'middle' | 'large';
  style?: React.CSSProperties;
  className?: string;
}

const SIZE_CLASS = { small: 'nst-btn--sm', middle: 'nst-btn--md', large: 'nst-btn--lg' } as const;

export function VwSegmented<T extends string = string>({
  value, onChange, options, size = 'middle', style, className,
}: VwSegmentedProps<T>) {
  const normalized = options.map((o) =>
    typeof o === 'string' || typeof o === 'number' ? { label: String(o), value: o as T } : o,
  );
  const sizeClass = SIZE_CLASS[size];

  return (
    <div className={['vw-segmented vw-wrap', className].filter(Boolean).join(' ')} style={style}>
      {normalized.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            className={`nst-btn ${sizeClass}${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
          >
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export default VwSegmented;
