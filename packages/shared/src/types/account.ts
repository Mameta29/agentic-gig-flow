export type AccountRole = 'PM' | 'Accountant' | 'Executive' | 'Worker';

export type Account = {
  id: string;
  companyId: string;
  type: 'company' | 'worker';
  displayName: string;
  entraObjectId?: string;
  roles: AccountRole[];
  company?: {
    spendingLimitMonthly?: number;
    spendingLimitPerOrder?: number;
  };
  worker?: {
    githubLogin: string;
    wallet: string;
    countryCode?: string;
    timezone?: string;
  };
  createdAt: string;
};
