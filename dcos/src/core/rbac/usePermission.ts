import { useAuth } from '../auth/AuthContext';
import { hasPermission, type ModuleCode, type Permission } from './permissions';

export function usePermission() {
  const { user } = useAuth();

  return {
    can: (module: ModuleCode, permission: Permission) =>
      hasPermission(user.roleId, module, permission),
    canAny: (module: ModuleCode, permissions: Permission[]) =>
      permissions.some(p => hasPermission(user.roleId, module, p)),
    canAll: (module: ModuleCode, permissions: Permission[]) =>
      permissions.every(p => hasPermission(user.roleId, module, p)),
    canAccessModule: (module: ModuleCode) =>
      hasPermission(user.roleId, module, 'read'),
  };
}
