/**
 * Motion tokens — calm, fast, decisive.
 *
 * Four durations × two easings cover every transition in the platform.
 * No "bouncy" or playful curves — telecom UX must read as confident and
 * controlled. Cubic-bezier choices are inspired by Linear / Stripe.
 *
 * Apply as CSS `transition: <prop> <duration> <easing>` or via
 * `framer-motion` `transition={EASING.standard}` style props.
 */

/** Durations (ms). */
export const DURATION = {
  /** Pulse / hover micro-feedback. */
  xfast: 120,
  /** Card hover, button state. */
  fast: 180,
  /** Default panel slide, drawer open. */
  standard: 240,
  /** Page-level transitions, large reveals. */
  slow: 380,
} as const;

/** Easing curves. */
export const EASING = {
  /** Most transitions — accelerate in, decelerate out. */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Entering elements — slow-in, fast-out. */
  enter: 'cubic-bezier(0.0, 0, 0.2, 1)',
  /** Exiting elements — fast-in, slow-out. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  /** Sharp, decisive — for state changes that demand attention. */
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
} as const;

/** Pre-baked CSS transition strings for common combinations. */
export const TRANSITION = {
  hover: `all ${DURATION.fast}ms ${EASING.standard}`,
  panel: `all ${DURATION.standard}ms ${EASING.standard}`,
  page: `all ${DURATION.slow}ms ${EASING.standard}`,
  reveal: `opacity ${DURATION.standard}ms ${EASING.enter}, transform ${DURATION.standard}ms ${EASING.enter}`,
} as const;

/**
 * Keyframes for the live operational pulse. Inject once at app root
 * via `<style>{PULSE_KEYFRAMES}</style>`.
 */
export const PULSE_KEYFRAMES = `
@keyframes ux-pulse {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes ux-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
@keyframes ux-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
