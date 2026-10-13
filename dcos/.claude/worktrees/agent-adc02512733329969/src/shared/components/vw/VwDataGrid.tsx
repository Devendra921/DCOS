import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { AgGridReactProps } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

// VW owns appearance; AG Grid owns column sizing, keyboard navigation and row virtualization.
const vwGridTheme = themeQuartz.withParams({
  fontFamily: 'var(--fontFamily)', fontSize: 13,
  backgroundColor: 'var(--vw-color-white)',
  foregroundColor: 'var(--vw-color-neutral-600)',
  headerBackgroundColor: 'var(--vw-color-neutral-50)',
  headerTextColor: 'var(--vw-color-neutral-500)',
  headerFontSize: 12, headerFontWeight: 500,
  borderColor: 'var(--vw-color-neutral-200)',
  rowBorder: { color: 'var(--vw-color-neutral-100)' },
  rowHoverColor: 'var(--vw-color-neutral-50)',
  accentColor: 'var(--vw-color-accent-500)',
  selectedRowBackgroundColor: 'var(--vw-color-accent-50)',
  spacing: 4, cellHorizontalPadding: 8,
  headerHeight: 40, rowHeight: 44,
  wrapperBorder: false, wrapperBorderRadius: 0,
});

export function VwDataGrid<T>({ ariaLabel, ...props }: AgGridReactProps<T> & { ariaLabel: string }) {
  return <div className="vw-ag-grid" role="region" aria-label={ariaLabel}>
    <AgGridReact<T> theme={vwGridTheme} domLayout="normal"
      defaultColDef={{ sortable: true, resizable: true, minWidth: 100 }}
      tooltipShowDelay={300} {...props} />
  </div>;
}
