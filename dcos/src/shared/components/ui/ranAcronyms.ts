/**
 * RAN-domain acronym dictionary — short form → full expansion.
 *
 * Used by <Acronym /> to attach an info-icon tooltip without callers having
 * to repeat the expansion at every occurrence. Looked up case-sensitively
 * (RAN engineers write "PCI" not "Pci"), but with a lowercase fallback for
 * defensive use.
 *
 * Add entries here rather than inlining expansions at the call site so the
 * vocabulary stays consistent across modules — for example "MoU" is always
 * "Memorandum of Understanding" everywhere, never "MoU agreement".
 */

export const RAN_ACRONYMS: Record<string, string> = {
  // Radio / network engineering
  PCI: 'Physical Cell Identifier',
  EIRP: 'Effective Isotropic Radiated Power',
  RSRP: 'Reference Signal Received Power',
  SINR: 'Signal-to-Interference-plus-Noise Ratio',
  MIMO: 'Multiple-Input Multiple-Output',
  RRH: 'Remote Radio Head',
  RU: 'Radio Unit',
  DU: 'Distributed Unit',
  CU: 'Centralized Unit',
  BBU: 'Baseband Unit',
  TAC: 'Tracking Area Code',
  EARFCN: 'E-UTRA Absolute Radio Frequency Channel Number',
  PIM: 'Passive Intermodulation',
  VSWR: 'Voltage Standing Wave Ratio',
  RET: 'Remote Electrical Tilt',
  ANR: 'Automatic Neighbor Relations',
  NR: 'New Radio (5G)',
  LTE: 'Long-Term Evolution (4G)',
  CBRS: 'Citizens Broadband Radio Service',
  ORAN: 'Open Radio Access Network',
  'O-RAN': 'Open Radio Access Network',
  'C-RAN': 'Centralized Radio Access Network',
  vRAN: 'Virtualized Radio Access Network',
  DAS: 'Distributed Antenna System',
  MW: 'Microwave',
  LOS: 'Line of Sight',
  AP: 'Access Point',
  SSID: 'Service Set Identifier',
  IBC: 'In-Building Coverage',

  // Lifecycle / status
  RAG: 'Red / Amber / Green health indicator',
  KPI: 'Key Performance Indicator',
  SLA: 'Service Level Agreement',
  RFP: 'Request for Proposal',
  RFI: 'Request for Information',
  PIR: 'Post-Implementation Review',
  CAB: 'Change Advisory Board',

  // Commercial / contracts
  MoU: 'Memorandum of Understanding',
  MSA: 'Master Services Agreement',
  SOW: 'Statement of Work',
  NDA: 'Non-Disclosure Agreement',
  DPA: 'Data Processing Addendum',
  PO: 'Purchase Order',
  TCV: 'Total Contract Value',
  ARR: 'Annual Recurring Revenue',
  MRR: 'Monthly Recurring Revenue',

  // Operations
  COW: 'Cell on Wheels (mobile temporary site)',
  PoE: 'Power over Ethernet',
  AMSL: 'Above Mean Sea Level',
  AGL: 'Above Ground Level',
  ROI: 'Return on Investment',
  TCO: 'Total Cost of Ownership',
  MTBF: 'Mean Time Between Failures',
  MTTR: 'Mean Time To Repair',

  // Geographic / regulatory
  AOI: 'Area of Interest',
  AOR: 'Area of Responsibility',
  FCC: 'Federal Communications Commission',
  GDPR: 'General Data Protection Regulation',
  DPDP: 'Digital Personal Data Protection (India)',
};

/** Look up the expansion for `short`. Returns `undefined` if unknown. */
export const lookupAcronym = (short: string): string | undefined => {
  if (RAN_ACRONYMS[short]) return RAN_ACRONYMS[short];
  // Defensive case-insensitive fallback — engineers will sometimes type
  // "pci" or "Pci" instead of the canonical "PCI".
  const match = Object.keys(RAN_ACRONYMS).find(
    (k) => k.toLowerCase() === short.toLowerCase(),
  );
  return match ? RAN_ACRONYMS[match] : undefined;
};
