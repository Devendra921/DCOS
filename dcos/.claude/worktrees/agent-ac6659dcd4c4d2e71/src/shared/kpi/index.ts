// DCOS KPI surface. RAN-specific KPI bodies were removed; DCOS KPI
// computations land per the KPI Dictionary in Stage 1+. The deterministic
// time-series bucketing engine is reused as-is.
export * from './timeSeries';
