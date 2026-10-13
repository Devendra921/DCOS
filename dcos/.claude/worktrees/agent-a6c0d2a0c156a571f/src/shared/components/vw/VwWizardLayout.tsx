import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Header and actions stay outside the only scrolling region. Step state belongs to callers. */
export function VwWizardLayout({ title, steps, footer, step, children }: {
  title: string; steps: ReactNode; footer: ReactNode; step: number; children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!body.current) return;
    body.current.scrollTop = 0;
    const active = body.current.parentElement?.querySelector('.ant-steps-item-process');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [step]);
  return <section className="vw-wizard-page" aria-label={title}>
    <header className="vw-wizard-header">
      <h1 className="vw-page-title">{title}</h1>
      <div className="vw-wizard-steps" aria-label="Progress">{steps}</div>
    </header>
    <div className="vw-wizard-content" ref={body} role="region" aria-label={`${title} step content`} tabIndex={0}>
      <div className="vw-wizard-content-inner">{children}</div>
    </div>
    <footer className="vw-wizard-footer" aria-label="Form actions">{footer}</footer>
  </section>;
}
