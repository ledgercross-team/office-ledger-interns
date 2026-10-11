import type { GameMasterCompany } from './types';

export type CompanyStateKey = 'expired' | 'expiring' | 'inactive' | 'active';

export interface CompanyState {
  key: CompanyStateKey;
  label: string;
  className: string;
  // Lower sorts first: expired and expiring companies need attention first.
  priority: number;
}

const EXPIRING_DAYS = 14;

// Active, "Ends in ≤14 days", Expired or Inactive.
export function companyState(company: Pick<GameMasterCompany, 'isActive' | 'daysLeft' | 'subscription'>): CompanyState {
  if (!company.isActive) {
    return { key: 'inactive', label: 'Inactive', className: 'bg-charcoal/10 text-charcoal', priority: 2 };
  }
  if (!company.subscription || company.daysLeft === null || company.daysLeft < 0) {
    return { key: 'expired', label: 'Expired', className: 'bg-alert-tint text-alert-deep', priority: 0 };
  }
  if (company.daysLeft <= EXPIRING_DAYS) {
    return {
      key: 'expiring',
      label: `Ends in ${company.daysLeft} ${company.daysLeft === 1 ? 'day' : 'days'}`,
      className: 'bg-amber-tint text-amber-deep',
      priority: 1,
    };
  }
  return { key: 'active', label: 'Active', className: 'bg-mist text-forest', priority: 3 };
}
