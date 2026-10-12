import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Role } from '../../auth/auth.types';
import { users } from '../../db/schema';

// Roles a caller may manage in tasks and attendance: admin -> managers and employees,
// manager -> employees.
export function manageableRoles(role: Role): Role[] {
  if (role === 'admin') return ['manager', 'employee'];
  if (role === 'manager') return ['employee'];
  return [];
}

// Roles shown in the people directory. Admins also see (and can add) fellow admins.
export function directoryRoles(role: Role): Role[] {
  return role === 'admin' ? ['admin', ...manageableRoles(role)] : manageableRoles(role);
}

/**
 * SQL for "people this caller may manage": an admin sees every manager and employee,
 * a manager sees only the employees assigned to them. Works on an aliased users table too.
 */
export function managedPeople(
  caller: { id: string; role: Role },
  table: typeof users = users,
): SQL {
  if (caller.role === 'admin') {
    return inArray(table.role, ['manager', 'employee']);
  }
  if (caller.role === 'manager') {
    return and(eq(table.role, 'employee'), eq(table.managerId, caller.id)) as SQL;
  }
  return sql`false`;
}
