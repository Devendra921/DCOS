import { forwardRef } from 'react';
import { Button as AntButton } from 'antd';
import type { ButtonProps, GetRef } from 'antd';

/** NST button classes over the existing AntD interaction and loading behavior. */
export const VwButton = forwardRef<GetRef<typeof AntButton>, ButtonProps>(function VwButton(
  { className, size, type, danger, ...props }, ref,
) {
  const variant = danger ? (type === 'primary' ? 'danger' : 'danger-subtle') : type === 'primary' ? 'filled'
    : type === 'text' ? 'ghost' : type === 'link' ? 'action' : '';
  const scale = size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md';
  return <AntButton ref={ref} {...props} type={type} danger={danger} size={size}
    className={['nst-btn', variant && `nst-btn--${variant}`, props.children == null && props.icon && 'nst-btn--icon', `nst-btn--${scale}`, className].filter(Boolean).join(' ')} />;
});
