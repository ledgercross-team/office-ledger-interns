import { manageableRoles } from './visibility';

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
