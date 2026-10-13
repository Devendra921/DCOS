export type Permission = 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'configure';

export type ModuleCode =
  | 'SLM' | 'SAQ' | 'RFD' | 'PWR' | 'MWL' | 'CRN' | 'SHR'
  | 'QAM' | 'RPT' | 'GIS' | 'EXT' | 'HSC' | 'AIM' | 'MOB'
  | 'FIN' | 'CRW' | 'LSM' | 'COL' | 'NRV' | 'PPM'
  | 'AIM_INV' | 'DMS' | 'VND' | 'NTF' | 'ADMIN';

const ALL: Permission[] = ['read', 'create', 'edit', 'delete', 'approve', 'configure'];
const CRUD: Permission[] = ['read', 'create', 'edit', 'delete'];
const READ_ONLY: Permission[] = ['read'];
const READ_EDIT: Permission[] = ['read', 'edit'];
const READ_CREATE_EDIT: Permission[] = ['read', 'create', 'edit'];

type PermissionMatrix = Record<string, Partial<Record<ModuleCode, Permission[]>>>;

export const PERMISSION_MATRIX: PermissionMatrix = {
  R01: Object.fromEntries(['SLM','SAQ','RFD','PWR','MWL','CRN','SHR','QAM','RPT','GIS','EXT','HSC','AIM','MOB','FIN','CRW','LSM','COL','NRV','PPM','AIM_INV','DMS','VND','NTF','ADMIN'].map(m => [m, ALL])) as Record<ModuleCode, Permission[]>,
  R02: { SLM: CRUD, SAQ: READ_ONLY, RFD: READ_ONLY, PWR: READ_ONLY, MWL: READ_ONLY, CRN: READ_ONLY, SHR: READ_ONLY, QAM: READ_ONLY, RPT: ALL, GIS: READ_ONLY, HSC: READ_ONLY, AIM: READ_ONLY, FIN: CRUD, CRW: READ_ONLY, LSM: READ_ONLY, COL: CRUD, NRV: READ_ONLY, PPM: ALL, DMS: READ_ONLY, VND: READ_ONLY, NTF: READ_EDIT },
  R03: { SLM: CRUD, SAQ: CRUD, RFD: READ_EDIT, PWR: READ_EDIT, MWL: READ_EDIT, CRN: READ_EDIT, SHR: READ_EDIT, QAM: CRUD, RPT: CRUD, GIS: CRUD, HSC: CRUD, AIM: READ_ONLY, MOB: READ_ONLY, FIN: CRUD, CRW: CRUD, LSM: READ_EDIT, COL: CRUD, NRV: CRUD, PPM: CRUD, AIM_INV: CRUD, DMS: CRUD, VND: CRUD, NTF: READ_EDIT },
  R04: { SLM: READ_EDIT, SAQ: ALL, LSM: CRUD, COL: CRUD, DMS: CRUD },
  R05: { SLM: READ_ONLY, SAQ: READ_CREATE_EDIT, COL: READ_CREATE_EDIT, DMS: READ_CREATE_EDIT, MOB: CRUD },
  R06: { SLM: READ_EDIT, RFD: ALL, COL: READ_CREATE_EDIT, DMS: READ_CREATE_EDIT },
  R07: { SLM: READ_EDIT, MWL: ALL, COL: READ_CREATE_EDIT, DMS: READ_CREATE_EDIT },
  R08: { SLM: READ_EDIT, RFD: ALL, COL: READ_CREATE_EDIT },
  R09: { SLM: READ_EDIT, RFD: ALL, COL: READ_CREATE_EDIT },
  R10: { SLM: READ_EDIT, CRN: ALL, COL: READ_CREATE_EDIT },
  R11: { SLM: READ_EDIT, PWR: ALL, COL: READ_CREATE_EDIT },
  R12: { SLM: READ_EDIT, QAM: READ_CREATE_EDIT, HSC: READ_CREATE_EDIT, MOB: CRUD, COL: READ_CREATE_EDIT },
  R13: { SLM: READ_EDIT, QAM: CRUD, HSC: CRUD, CRW: CRUD, MOB: CRUD, COL: CRUD },
  R14: { SLM: READ_EDIT, RFD: READ_EDIT, NRV: CRUD, EXT: READ_EDIT, COL: READ_CREATE_EDIT },
  R15: { SLM: READ_EDIT, RFD: READ_EDIT, NRV: CRUD, COL: READ_CREATE_EDIT },
  R16: { SLM: READ_EDIT, QAM: ALL, COL: READ_CREATE_EDIT, DMS: CRUD },
  R17: { HSC: ALL, SLM: READ_ONLY, COL: READ_CREATE_EDIT },
  R18: { FIN: ALL, SLM: READ_ONLY, RPT: CRUD, VND: CRUD, LSM: CRUD, COL: CRUD },
  R19: { SLM: READ_ONLY, QAM: READ_EDIT, VND: READ_EDIT, COL: READ_CREATE_EDIT, DMS: READ_CREATE_EDIT, MOB: READ_ONLY },
  R20: { SLM: READ_ONLY, QAM: READ_CREATE_EDIT, MOB: CRUD, COL: READ_CREATE_EDIT },
  R21: { SHR: ALL, SLM: READ_EDIT, COL: CRUD },
  R22: { LSM: ALL, SAQ: READ_EDIT, SLM: READ_ONLY, COL: CRUD },
  R23: { CRW: ALL, SLM: READ_ONLY, MOB: READ_ONLY, COL: READ_CREATE_EDIT },
  R24: { SLM: READ_ONLY, RPT: READ_ONLY, GIS: READ_ONLY, FIN: READ_ONLY, PPM: READ_ONLY, AIM: READ_ONLY },
  R25: { RPT: ALL, GIS: CRUD, SLM: READ_ONLY, AIM: READ_ONLY },
  R26: { GIS: ALL, SLM: READ_ONLY, RPT: READ_ONLY },
};

export function hasPermission(roleId: string, module: ModuleCode, permission: Permission): boolean {
  const rolePerms = PERMISSION_MATRIX[roleId];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(permission);
}
