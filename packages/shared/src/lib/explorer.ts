/**
 * Polygonscan URL helpers. Network is selected by chain id so mainnet/testnet
 * is a config switch shared by Functions, the Adaptive Cards, and the Dashboard.
 */

const POLYGON_AMOY_CHAIN_ID = 80002;

/** Polygonscan host for the given chain id (80002 = Amoy testnet). */
export function explorerHost(chainId: number): string {
  return chainId === POLYGON_AMOY_CHAIN_ID
    ? 'amoy.polygonscan.com'
    : 'polygonscan.com';
}

/** Full Polygonscan transaction URL for the given tx hash and chain id. */
export function explorerTxUrl(txHash: string, chainId: number): string {
  return `https://${explorerHost(chainId)}/tx/${txHash}`;
}
