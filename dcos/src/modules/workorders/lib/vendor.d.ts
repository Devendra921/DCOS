/* Minimal typings for the bpmn.io packages that ship without TypeScript declarations for the entry points we use. */

declare module 'bpmn-moddle' {
  export interface ModdleElement {
    $type: string;
    id?: string;
    name?: string;
    // moddle elements are open records — attributes and references are resolved onto the object.
    [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>, options?: Record<string, unknown>);
    fromXML(xml: string, options?: Record<string, unknown>): Promise<{ rootElement: ModdleElement; warnings: unknown[] }>;
  }
}

declare module 'dmn-js/lib/NavigatedViewer' {
  export interface DmnView { id: string; type: 'drd' | 'decisionTable' | 'literalExpression' | 'boxedExpression'; element: unknown }
  export default class DmnNavigatedViewer {
    constructor(options?: { container?: HTMLElement | string; width?: number | string; height?: number | string; [key: string]: unknown });
    importXML(xml: string, options?: unknown): Promise<{ warnings: unknown[] }>;
    getViews(): DmnView[];
    getActiveView(): DmnView | undefined;
    getActiveViewer(): unknown;
    open(view: DmnView): Promise<{ warnings: unknown[] }>;
    attachTo(parent: HTMLElement): void;
    detach(): void;
    destroy(): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
  }
}
