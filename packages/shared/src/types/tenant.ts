export type Tenant = {
  id: string;
  displayName: string;
  domain?: string;
  defaultRepository?: string;
  defaultCurrency: 'JPYC';
  fabricWorkspaceId?: string;
  copilotStudioBotId?: string;
  spendingLimitPerOrder: number;
  spendingLimitMonthly?: number;
  walletAddress?: string;
  createdAt: string;
};
