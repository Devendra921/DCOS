import type { ThemeConfig } from 'antd';

// AntD's palette generation requires literal colors. These values mirror the
// vendored NST colors.css, components.css and theme-black.css; DOM-only styles
// use their CSS variables. Existing component behavior remains owned by AntD.
const PRIMARY = '#1c81ef';        // primaryColor500 — NST brand blue (matches the ideation app)
const PRIMARY_HOVER = '#4290ed';  // --color-primary-hover
const PRIMARY_PRESS = '#1767be';  // --color-primary-press
const SURFACE = '#ffffff';        // --vw-color-gray-10
const BG_LAYOUT = '#f8fafc';      // --nstPageBackground (vw-design-tokens.css) — literal here too since this
                                  // feeds antd's color-derivation math (see PRIMARY note above); keep in sync
const BORDER = '#e2e8f0';         // slate-200 (ideation --line)
const BORDER_SOFT = '#f1f5f9';    // slate-100 (ideation --line-soft) — table dividers / chart gridlines

const TEXT_PRIMARY = '#0f172a';   // --vw-color-gray-900 (headings, strong text)
const TEXT_SECONDARY = '#475569'; // --vw-color-gray-600 (body)
const TEXT_TERTIARY = '#64748b';  // --vw-color-gray-500 (label hint; = capacity's cf-description color)

// Semantic text shades (paired with pastel bg fills in STATUS_PALETTE below).
// green-600/red-600, NOT the lighter green-500/red-500 the vw- palette
// separately labels --vw-color-success/--vw-color-danger — this app's own
// KPICard.tsx (TREND_CONFIG) and shared/components/ux/uxTokens.ts (UX.green/
// UX.red) had already independently converged on green-600/red-600 across
// 35-45 files before this file was re-pointed to match them, so this is the
// de-facto canonical pair, not the vw- palette's nominal "success/danger" slot.
const STATUS_SUCCESS = '#16a34a'; // --vw-color-green-600 (feeds antd token — see PRIMARY note above)
const STATUS_WARNING = '#d97706'; // --vw-color-warning (amber-600)
const STATUS_DANGER = '#dc2626';  // --vw-color-red-600
const STATUS_INFO = '#2563eb';    // --vw-color-info (blue-600)

export const themeConfig: ThemeConfig = {
  token: {
    // Color
    colorPrimary: PRIMARY,
    colorPrimaryHover: PRIMARY_HOVER,
    colorPrimaryActive: PRIMARY_PRESS,
    colorLink: PRIMARY,
    colorLinkHover: PRIMARY_HOVER,
    colorSuccess: STATUS_SUCCESS,
    colorWarning: STATUS_WARNING,
    colorError: STATUS_DANGER,
    colorInfo: STATUS_INFO,

    // Surfaces & borders
    colorBgLayout: BG_LAYOUT,
    colorBgContainer: SURFACE,
    colorBorder: BORDER,
    colorBorderSecondary: BORDER_SOFT,

    // Text
    colorText: TEXT_PRIMARY,
    colorTextSecondary: TEXT_SECONDARY,
    colorTextTertiary: TEXT_TERTIARY,
    colorTextDescription: TEXT_TERTIARY,
    colorTextDisabled: '#cbd5e1',

    // Shape — NST radius ladder (4 / 8 / 16). 8 is the control workhorse,
    // 16 for cards, 4 for small chips/tags.
    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 16,

    // Poppins and the reference NST heading ladder (24 / 20 / 18 / 16 / 14).
    // Literal numbers are required by AntD's token calculations.
    fontFamily: `var(--fontFamily), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    controlHeight: 36,
    controlHeightSM: 30,
    controlHeightLG: 40,
    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
    fontSizeXL: 20,
    fontSizeHeading1: 24,
    fontSizeHeading2: 20,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,
    lineHeight: 1.5,
    lineHeightHeading1: 1.5,
    lineHeightHeading2: 1.5,

    // Elevation — NST carries resting surfaces on the hairline border; shadow
    // is reserved for raised/floating surfaces only.
    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    boxShadowSecondary: '0 1px 2px rgba(15,23,42,.04), 0 12px 32px -8px rgba(15,23,42,.16)',
  },
  components: {
    Layout: {
      siderBg: SURFACE,
      headerBg: SURFACE,
      bodyBg: BG_LAYOUT,
    },
    Menu: {
      // Light sidebar with a NEAR-BLACK "pill" for the selected item.
      // Explicit fontSize so sidebar text doesn't inherit the broader 13px
      // body — sidebars should be a touch denser than body copy (12.5px is
      // the sweet spot but antd rounds to int, so 12 it is).
      itemBg: SURFACE,
      itemColor: '#475569',
      itemHoverBg: '#f1f5f9',
      itemHoverColor: TEXT_PRIMARY,
      itemSelectedBg: '#eff6ff',
      itemSelectedColor: '#1d4ed8',
      itemActiveBg: '#f1f5f9',
      itemBorderRadius: 10,
      itemHeight: 38,
      iconSize: 20,
      collapsedIconSize: 20,
      fontSize: 13.5,
      groupTitleColor: TEXT_TERTIARY,
      groupTitleFontSize: 10,
      subMenuItemBg: SURFACE,
    },
    Button: {
      // Primary CTA is the NST brand blue; hover lightens, press darkens.
      colorPrimary: PRIMARY,
      colorPrimaryHover: PRIMARY_HOVER,
      colorPrimaryActive: PRIMARY_PRESS,
      primaryColor: 'var(--buttonFilledPrimaryTextColor)',

      // "default" (bordered) button ≈ NST "Stroked" variant — bound to
      // --buttonStrokedPrimary* (vw-level4-tokens.css). Safe as var(): unlike
      // colorPrimary above, these Button component tokens are dropped
      // straight into generated CSS text, never parsed by antd's color-math.
      defaultBg: 'var(--buttonStrokedPrimaryBgColor)',
      defaultColor: 'var(--buttonStrokedPrimaryTextColor)',
      defaultBorderColor: 'var(--buttonStrokedPrimaryBorderColor)',
      defaultHoverBg: 'var(--buttonStrokedPrimaryHoverBgColor)',
      defaultHoverColor: 'var(--buttonStrokedPrimaryHoverTextColor)',
      defaultHoverBorderColor: 'var(--buttonStrokedPrimaryHoverBorderColor)',
      defaultActiveBg: 'var(--buttonStrokedPrimaryFocusBgColor)',
      defaultActiveColor: 'var(--buttonStrokedPrimaryFocusTextColor)',
      defaultActiveBorderColor: 'var(--buttonStrokedPrimaryFocusBorderColor)',
      borderColorDisabled: 'var(--buttonStrokedDisabledBorderColor)',

      // "text"/"link" variants ≈ NST "Basic" — bound to --buttonBasicPrimary*
      textTextColor: 'var(--buttonBasicPrimaryTextColor)',
      textTextHoverColor: 'var(--buttonBasicPrimaryHoverTextColor)',
      textTextActiveColor: 'var(--buttonBasicPrimaryFocusTextColor)',
      textHoverBg: 'var(--buttonBasicPrimaryHoverBgColor)',
      linkHoverBg: 'var(--buttonBasicPrimaryHoverBgColor)',

      // danger ≈ NST "Warn" variant text color
      dangerColor: 'var(--buttonFilledWarnTextColor)',

      borderRadius: 8, // = --buttonRadius (var(--fieldRadius) = 8px in this app's ramp)
      fontWeight: 500,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#64748b',
      headerSplitColor: 'transparent',
      borderColor: BORDER_SOFT,
      rowHoverBg: '#f5f9ff',
      rowSelectedBg: '#eff6ff',
      rowSelectedHoverBg: '#dbeafe',
      cellFontSize: 13,
      cellFontSizeMD: 13,
      cellFontSizeSM: 13,
      cellPaddingBlock: 10,
      cellPaddingInline: 12,
      cellPaddingBlockMD: 10,
      cellPaddingInlineMD: 12,
      cellPaddingBlockSM: 10,
      cellPaddingInlineSM: 12,
    },
    Card: {
      colorBgContainer: SURFACE,
      colorBorderSecondary: BORDER,
      borderRadiusLG: 16,
      paddingLG: 16,
    },
    Tag: {
      defaultBg: BORDER_SOFT,
      defaultColor: TEXT_SECONDARY,
      borderRadiusSM: 6,
    },
    Tabs: {
      itemColor: TEXT_SECONDARY,
      itemSelectedColor: PRIMARY,
      itemHoverColor: TEXT_PRIMARY,
      inkBarColor: PRIMARY,
      titleFontSize: 14,
    },
    Segmented: {
      // Solid brand-color pill for the active segment (view switchers,
      // list-page filter toggles) instead of antd's default plain white
      // sub-pill — matches the filled-active look used everywhere else
      // (sidebar, tabs, selected table rows). Track itself is white — the
      // outer 1px border (index.css) is what frames the control now,
      // rather than a grey track fill.
      trackBg: '#ffffff',
      itemColor: TEXT_SECONDARY,
      itemHoverColor: TEXT_PRIMARY,
      itemHoverBg: 'rgba(15,23,42,0.04)',
      itemSelectedBg: PRIMARY,
      itemSelectedColor: '#ffffff',
      itemActiveBg: PRIMARY_PRESS,
    },
    Input: {
      borderRadius: 8,
      colorBorder: BORDER,
      // Bound to --field* tokens (vw-level4-tokens.css) — safe as var(),
      // same reasoning as the Button block above.
      hoverBorderColor: 'var(--fieldHoverBorderColor)',
      activeBorderColor: 'var(--fieldFocusBorderColor)',
    },
    Select: {
      borderRadius: 8,
      // Bound to --dropdown* tokens (vw-level4-tokens.css)
      optionSelectedColor: 'var(--dropdownSelectedTextColor)',
      optionSelectedBg: 'var(--dropdownSelectedBgColor)',
      optionActiveBg: 'var(--dropdownItemHoverBgColor)',
      hoverBorderColor: 'var(--fieldHoverBorderColor)',
      activeBorderColor: 'var(--fieldFocusBorderColor)',
    },
    Form: {
      labelColor: '#64748b',
      labelFontSize: 12,
      itemMarginBottom: 16,
      verticalLabelPadding: '0 0 4px',
    },
    Statistic: {
      titleFontSize: 11,
      contentFontSize: 28,
    },
    // Bound to --slider* tokens (vw-level4-tokens.css)
    Slider: {
      trackBg: 'var(--sliderActiveTrackBgColor)',
      trackHoverBg: 'var(--sliderActiveTrackBgColor)',
      railBg: 'var(--sliderTrackBgColor)',
      railHoverBg: 'var(--sliderTrackBgColor)',
      handleColor: 'var(--sliderThumbBorderColor)',
      dotBorderColor: 'var(--sliderThumbBorderColor)',
      trackBgDisabled: 'var(--sliderDisabledActiveBgColor)',
    },
    // Bound to --datePicker* tokens (vw-level4-tokens.css)
    DatePicker: {
      cellHoverBg: 'var(--datePickerCellInRangeHoverBgColor)',
      cellActiveWithRangeBg: 'var(--datePickerSelectedRangeCellBgColor)',
      cellHoverWithRangeBg: 'var(--datePickerCellInRangeHoverBgColor)',
    },
    // --dialogRadius (1em) — matches Card's borderRadiusLG for consistency
    Modal: {
      borderRadiusLG: 16,
    },
    // Bound to --uploadBoxActionTextColor (vw-level4-tokens.css)
    Upload: {
      actionsColor: 'var(--uploadBoxActionTextColor)',
    },
    // Bound to --breadCrumb* tokens (vw-level4-tokens.css)
    Breadcrumb: {
      itemColor: 'var(--breadCrumbBreadColor)',
      linkColor: 'var(--breadCrumbBreadColor)',
      lastItemColor: 'var(--breadCrumbRecentBreadColor)',
      separatorColor: 'var(--breadCrumbIconColor)',
    },
  },
};

// ─── Status palette (soft pastel pills) ───────────────────────────────
// Each status maps to { bg, fg } — bg is the soft pill fill, fg is the
// matching dark-shade text. Consumers that previously imported single
// hex strings still work via the back-compat object below.

export interface StatusPalette {
  bg: string;
  fg: string;
}

// capacity-forecaster semantic pairs — pastel bg + darker text of the same
// vw-color-* family (success green-100/green-700, warning amber-100/amber-700,
// danger red-100/red-700, info blue-100/blue-700, neutral gray-100/gray-600).
export const STATUS_PALETTE: Record<string, StatusPalette> = {
  // Green family (success)
  'On Track':     { bg: '#dcfce7', fg: '#15803d' },
  'On-Air':       { bg: '#dcfce7', fg: '#15803d' },
  'Accepted':     { bg: '#dcfce7', fg: '#15803d' },
  'Active':       { bg: '#dcfce7', fg: '#15803d' },
  'Completed':    { bg: '#dcfce7', fg: '#15803d' },

  // Amber family (warning)
  'At Risk':         { bg: '#fef3c7', fg: '#b45309' },
  'On-Hold':         { bg: '#fef3c7', fg: '#b45309' },
  'Pending':         { bg: '#fef3c7', fg: '#b45309' },
  'Expiring Soon':   { bg: '#fef3c7', fg: '#b45309' },

  // Red family (danger)
  'Delayed':   { bg: '#fee2e2', fg: '#b91c1c' },
  'Blocked':   { bg: '#fee2e2', fg: '#b91c1c' },
  'Expired':   { bg: '#fee2e2', fg: '#b91c1c' },
  'Terminated':{ bg: '#fee2e2', fg: '#b91c1c' },

  // Blue family (info)
  'In Progress':  { bg: '#dbeafe', fg: '#1d4ed8' },
  'Under Review': { bg: '#dbeafe', fg: '#1d4ed8' },

  // Neutral
  'Not Started': { bg: '#f3f4f6', fg: '#4b5563' },
  'Cancelled':   { bg: '#f3f4f6', fg: '#4b5563' },
  'Draft':       { bg: '#f3f4f6', fg: '#4b5563' },
};

/** Back-compat shim: callers that imported single hex strings still work. */
export const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_PALETTE).map(([k, v]) => [k, v.fg]),
);

export const RAG_COLORS = {
  red: STATUS_DANGER,
  amber: STATUS_WARNING,
  green: STATUS_SUCCESS,
  grey: TEXT_TERTIARY,
} as const;

export const RAG_PALETTE: Record<'Red' | 'Amber' | 'Green' | 'Grey', StatusPalette> = {
  Red:   { bg: '#fee2e2', fg: '#b91c1c' },
  Amber: { bg: '#fef3c7', fg: '#b45309' },
  Green: { bg: '#dcfce7', fg: '#15803d' },
  Grey:  { bg: '#f3f4f6', fg: '#4b5563' },
};

// Technology palette stays vibrant but is reserved for dots/chart series —
// it never paints the chrome. Hues kept per category, redrawn from capacity's
// vw-color-* scale so every color traces back to the shared token set.
export const TECHNOLOGY_COLORS: Record<string, string> = {
  // DCOS asset-class / purpose palette — reserved for dots/series, never chrome.
  'Compute': '#1d4ed8',   // vw-color-blue-700
  'GPU': '#7c3aed',       // vw-color-violet-600
  'Storage': '#0e7490',   // vw-color-cyan-700
  'Network': 'var(--vw-color-green-600)',   // vw-color-green-600
  'Power': 'var(--vw-color-amber-600)',     // vw-color-amber-600
  'Cooling': '#06b6d4',   // vw-color-cyan-500
  'Mixed': '#6b7280',     // vw-color-gray-500
  'Server': '#1d4ed8',    // vw-color-blue-700
  'Switch': 'var(--vw-color-green-600)',    // vw-color-green-600
  'Router': '#15803d',    // vw-color-green-700
  'Firewall': 'var(--vw-color-red-600)',  // vw-color-red-600
  'GPU-Node': '#7c3aed',  // vw-color-violet-600
  'PDU': 'var(--vw-color-amber-600)',       // vw-color-amber-600
  'UPS': '#b45309',       // vw-color-amber-700
}

export const CARD_TOKENS = {
  padding: 16,
  borderRadius: 16,
  shadow: 'none',
  border: BORDER,
} as const;

// Series palette for charts — 5 colors in a deterministic order, slightly
// desaturated from default antd-charts so multi-series visuals don't
// vibrate. Use sequentially: first series = SERIES[0], etc.
// Brand-aligned series: brand-black lead, then well-separated semantic
// accents. NOTE: black as a lead series color can visually blend with
// axis lines/gridlines/labels in some chart types — worth a visual check
// per chart if a series looks like it's "disappearing" into the chrome.
// Literal hex, not tokens: @ant-design/charts renders to canvas, which can't
// resolve `var(--...)` references (unlike DOM/CSS consumers, canvas fillStyle
// needs an actual computed color string) — same failure class as the antd
// theme `token` consts above, different underlying reason (rendering target,
// not color-space math).
export const CHART_SERIES = [
  '#1c81ef', // brand primary
  '#16A34A', // vw-color-green-600 (success)
  '#D97706', // vw-color-amber-600 (warning)
  '#A855F7', // vw-color-purple-500 (promo purple)
  '#DB2777', // vw-color-pink-600
] as const;

export const CHART_TOKENS = {
  axisLabelColor: TEXT_TERTIARY,
  axisLabelSize: 11,
  gridColor: BORDER_SOFT,
  tooltipBg: SURFACE,
  tooltipBorder: BORDER,
} as const;


// DC tier accent palette (Uptime Institute).
export const TIER_COLORS: Record<string, string> = {
  'Tier I': '#9ca3af',   // vw-color-gray-400
  'Tier II': 'var(--vw-color-green-600)',  // vw-color-green-600
  'Tier III': '#2563eb', // vw-color-blue-600
  'Tier IV': '#7c3aed',  // vw-color-violet-600
};
