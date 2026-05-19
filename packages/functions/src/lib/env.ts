/**
 * Centralized environment access. Throws on missing required vars at usage site.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  cosmosEndpoint: () => required('COSMOS_ENDPOINT'),
  cosmosDatabase: () => process.env.COSMOS_DATABASE || 'gigflow',
  keyVaultName: () => required('KEY_VAULT_NAME'),
  openaiEndpoint: () => required('AZURE_OPENAI_ENDPOINT'),
  openaiDeployment: () =>
    process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
  openaiApiVersion: () =>
    process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
  polygonRpc: () => process.env.POLYGON_RPC || 'https://polygon-rpc.com',
  // 137 = Polygon mainnet, 80002 = Polygon Amoy testnet. Defaults to mainnet.
  polygonChainId: () => Number(process.env.POLYGON_CHAIN_ID || '137'),
  jpycAddress: () =>
    (process.env.JPYC_ADDRESS as `0x${string}`) ||
    ('0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB' as const),
  walletPkSecretName: () =>
    process.env.WALLET_PK_SECRET_NAME || 'wallet-pk',
  githubPatSecretName: () =>
    process.env.GITHUB_PAT_SECRET_NAME || 'github-pat',
  githubWebhookSecretName: () =>
    process.env.GITHUB_WEBHOOK_SECRET_NAME || 'github-webhook-secret',
  functionsAppAudience: () =>
    process.env.FUNCTIONS_APP_AUDIENCE || 'api://gigflow-functions',
  mcpAppAudience: () =>
    process.env.MCP_APP_AUDIENCE || 'api://gigflow-mcp',
  botAppId: () => optional('BOT_APP_ID'),
  botClientSecretName: () =>
    process.env.BOT_CLIENT_SECRET_NAME || 'bot-client-secret',
  dashboardUrl: () => optional('DASHBOARD_URL'),
  powerBiReportUrl: () => optional('POWER_BI_REPORT_URL'),
  appInsightsConnectionString: () =>
    optional('APPLICATIONINSIGHTS_CONNECTION_STRING'),
};
