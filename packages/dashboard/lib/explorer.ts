import { explorerTxUrl } from '@gigflow/shared';

// 137 = Polygon mainnet, 80002 = Amoy testnet. Server-side env var.
const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || '137');

/** Polygonscan transaction URL for the configured Polygon network. */
export function txUrl(txHash: string): string {
  return explorerTxUrl(txHash, POLYGON_CHAIN_ID);
}
