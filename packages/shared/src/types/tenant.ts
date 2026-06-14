export type Tenant = {
  id: string;
  displayName: string;
  domain?: string;
  defaultRepository?: string;
  // 検収対象として許可する追加リポジトリ。defaultRepository に加えて Contract Agent の
  // companyContext.repositories に載る (dogfooding で本リポを足すときに使う)。
  allowedRepositories?: string[];
  defaultCurrency: 'JPYC';
  fabricWorkspaceId?: string;
  copilotStudioBotId?: string;
  spendingLimitPerOrder: number;
  spendingLimitMonthly?: number;
  walletAddress?: string;
  createdAt: string;
};
