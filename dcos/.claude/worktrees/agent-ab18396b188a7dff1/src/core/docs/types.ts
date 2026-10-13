import type { ReactNode } from 'react';

/** A single explanatory block — intro prose + optional bullet list. */
export interface DocBlock {
  /** short heading, e.g. "IP allocation status" */
  title: string;
  /** optional lucide/antd icon node */
  icon?: ReactNode;
  /** intro paragraph */
  body?: string;
  /** supporting points */
  bullets?: string[];
  /** highlight (tinted) vs plain card — alternate for rhythm like the reference */
  tone?: 'plain' | 'tint';
}

/** Page-level context shown in the Synopsis drawer for the current route. */
export interface SynopsisDoc {
  /** page title, e.g. "Prefixes" */
  title: string;
  /** one-line summary under the title */
  summary?: string;
  blocks: DocBlock[];
  /** true when this is a generic stub rather than authored content */
  stub?: boolean;
}

/** A documented section within a module's playbook chapter. */
export interface PlaybookSection {
  heading: string;
  body?: string;
  bullets?: string[];
}

/** One module chapter in the platform-wide Playbook. */
export interface PlaybookModule {
  key: string;
  label: string;
  icon?: ReactNode;
  /** route the "Open module" link jumps to */
  route?: string;
  sections: PlaybookSection[];
  /** true when only a placeholder chapter exists */
  stub?: boolean;
}
