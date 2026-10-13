/**
 * WorkflowStepper — canonical multi-step workflow indicator.
 * Addresses ui-uxenhancment.md W3, W5, W6, HP-7, HP-12.
 *
 * Replaces "tabs as a workflow" anti-pattern for entities with a state
 * machine (punch items, co-location requests, migrations, closeouts).
 *
 * Highlights the current step, color-codes completed/upcoming/skipped/failed,
 * and exposes the "Next Action" CTA next to the step strip.
 */

import React from 'react';
import { CheckCircleFilled, CloseCircleFilled, MinusCircleFilled } from '../../icons';
import { UX } from './uxTokens';

export type StepState = 'completed' | 'current' | 'upcoming' | 'skipped' | 'failed';

export interface WorkflowStep {
  key: string;
  label: string;
  state: StepState;
  /** Optional sub-label / dwell time / due date. */
  hint?: string;
}

const STATE_CFG: Record<StepState, { bg: string; border: string; fg: string; iconBg: string; numColor: string; icon: React.ReactNode | null }> = {
  completed: { bg: '#dcfce7',  border: UX.green,    fg: '#166534', iconBg: UX.green,        numColor: '#fff', icon: <CheckCircleFilled /> },
  current:   { bg: '#dbeafe',  border: UX.blue,     fg: 'var(--vw-color-gray-900)', iconBg: UX.blue,         numColor: '#fff', icon: null },
  upcoming:  { bg: '#f8fafc',  border: UX.borderStrong, fg: UX.muted, iconBg: '#fff',       numColor: UX.muted, icon: null },
  skipped:   { bg: '#f1f5f9',  border: UX.borderStrong, fg: UX.muted, iconBg: '#cbd5e1',    numColor: '#fff', icon: <MinusCircleFilled /> },
  failed:    { bg: '#fef2f2',  border: UX.red,      fg: '#991b1b', iconBg: UX.red,          numColor: '#fff', icon: <CloseCircleFilled /> },
};

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  /** Render direction. */
  orientation?: 'horizontal' | 'vertical';
  /** Click a step to jump to it. */
  onStepClick?: (step: WorkflowStep, index: number) => void;
  /** Render-prop for a "Next Action" CTA shown next to the current step. */
  nextActionRenderer?: (currentStep: WorkflowStep | undefined) => React.ReactNode;
}

export function WorkflowStepper({ steps, orientation = 'horizontal', onStepClick, nextActionRenderer }: WorkflowStepperProps) {
  const currentStep = steps.find((s) => s.state === 'current');
  const isVert = orientation === 'vertical';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: "var(--vw-space-md)",
    }}>
      <div style={{
        display: 'flex',
        flexDirection: isVert ? 'column' : 'row',
        gap: isVert ? 0 : 4,
        alignItems: isVert ? 'stretch' : 'flex-start',
      }}>
        {steps.map((step, i) => {
          const cfg = STATE_CFG[step.state];
          const isLast = i === steps.length - 1;
          return (
            <React.Fragment key={step.key}>
              <div
                onClick={() => onStepClick?.(step, i)}
                role={onStepClick ? 'button' : undefined}
                aria-current={step.state === 'current' ? 'step' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: isVert ? 'row' : 'column',
                  alignItems: isVert ? 'flex-start' : 'center',
                  gap: isVert ? 12 : 6,
                  cursor: onStepClick ? 'pointer' : 'default',
                  flex: isVert ? '0 0 auto' : '1 1 0',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', flexDirection: isVert ? 'column' : 'row', alignItems: 'center', gap: isVert ? 4 : 8 }}>
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: 14,
                    background: cfg.iconBg,
                    color: cfg.numColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: "var(--vw-font-label-md)",
                    fontWeight: 700,
                    border: cfg.iconBg === '#fff' ? `2px solid ${cfg.border}` : 'none',
                    flexShrink: 0,
                  }}>
                    {cfg.icon ?? (i + 1)}
                  </div>
                  {isVert && !isLast && (
                    <div style={{
                      width: 2,
                      minHeight: 24,
                      background: step.state === 'completed' ? UX.green : UX.borderStrong,
                      margin: '4px 0',
                    }} />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1, alignSelf: isVert ? undefined : 'stretch', width: isVert ? undefined : '100%' }}>
                  <div style={{
                    fontSize: "var(--vw-font-label-sm)",
                    color: cfg.fg,
                    fontWeight: 500,
                    textAlign: isVert ? 'left' : 'center',
                    whiteSpace: isVert ? 'normal' : 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{step.label}</div>
                  {step.hint && (
                    <div style={{
                      fontSize: "var(--vw-font-label-xs)",
                      color: UX.muted,
                      textAlign: isVert ? 'left' : 'center',
                      marginTop: 2,
                    }}>{step.hint}</div>
                  )}
                </div>
              </div>
              {!isLast && !isVert && (
                <div style={{
                  height: 2,
                  flex: '0 0 16px',
                  alignSelf: 'center',
                  marginTop: -28,
                  background: steps[i].state === 'completed' ? UX.green : UX.borderStrong,
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {nextActionRenderer && (
        <div style={{ marginTop: isVert ? 8 : 4 }}>
          {nextActionRenderer(currentStep)}
        </div>
      )}
    </div>
  );
}

export default WorkflowStepper;
