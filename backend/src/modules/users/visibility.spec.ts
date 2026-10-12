import { directoryRoles, manageableRoles } from './visibility';

describe('manageableRoles', () => {
  it('lets an admin manage managers and employees', () => {
    expect(manageableRoles('admin')).toEqual(['manager', 'employee']);
  });

  it('lets a manager manage employees only', () => {
    expect(manageableRoles('manager')).toEqual(['employee']);
  });

  it('gives everyone else nothing', () => {
    expect(manageableRoles('employee')).toEqual([]);
    expect(manageableRoles('game_master')).toEqual([]);
  });
});

describe('directoryRoles', () => {
  it('shows admins their fellow admins as well', () => {
    expect(directoryRoles('admin')).toEqual(['admin', 'manager', 'employee']);
  });

  it('matches manageableRoles for everyone else', () => {
    expect(directoryRoles('manager')).toEqual(['employee']);
    expect(directoryRoles('employee')).toEqual([]);
  });
});
