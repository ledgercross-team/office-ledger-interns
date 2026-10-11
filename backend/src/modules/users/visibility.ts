import type { Role } from '../../auth/auth.types';

// Roles a caller may see and manage: admin -> managers and employees, manager -> employees.
export function manageableRoles(role: Role): Role[] {
  if (role === 'admin') return ['manager', 'employee'];
  if (role === 'manager') return ['employee'];
  return [];
}
