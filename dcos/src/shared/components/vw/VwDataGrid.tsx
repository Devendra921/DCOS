import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { AgGridReactProps } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

// VW owns appearance; AG Grid owns column sizing, keyboard navigation and row virtualization.
const vwGridTheme = themeQuartz.withParams({
  fontFamily: "var(--num, 'Inter', system-ui, sans-serif)", fontSize: 13,
  backgroundColor: 'var(--vw-color-white)',
  foregroundColor: 'var(--vw-color-slate-700)',
  headerBackgroundColor: 'var(--vw-color-slate-50)',
  headerTextColor: 'var(--vw-color-slate-500)',
  headerFontSize: 12, headerFontWeight: 500,
  borderColor: 'var(--vw-color-slate-200)',
  rowBorder: { color: 'var(--vw-color-slate-100)' },
  rowHoverColor: '#f5f9ff',
  accentColor: 'var(--primaryColor500)',
  selectedRowBackgroundColor: 'var(--primaryColor50)',
  spacing: 4, cellHorizontalPadding: 12,
  headerHeight: 41, rowHeight: 41,
  wrapperBorder: false, wrapperBorderRadius: 0,
});

export function VwDataGrid<T>({ ariaLabel, ...props }: AgGridReactProps<T> & { ariaLabel: string }) {
  return <div className="vw-ag-grid" role="region" aria-label={ariaLabel}>
    <AgGridReact<T> theme={vwGridTheme} domLayout="normal"
      defaultColDef={{ sortable: true, resizable: true, minWidth: 100 }}
      tooltipShowDelay={300} {...props} />
  </div>;
}
