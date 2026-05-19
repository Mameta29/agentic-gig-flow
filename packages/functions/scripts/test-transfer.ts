/**
 * One-shot script to verify viem -> JPYC.transfer works end-to-end.
 * Reads recipient + amount from CLI args.
 *   pnpm --filter @gigflow/functions exec tsx scripts/test-transfer.ts 0xRECIPIENT 100
 */
import { explorerTxUrl } from '@gigflow/shared';
import { transferJpyc, getBalance } from '../src/lib/blockchain.js';
import { env } from '../src/lib/env.js';

async function main() {
  const [, , to, amount] = process.argv;
  if (!to || !amount) {
    console.error('usage: tsx scripts/test-transfer.ts <0xrecipient> <amountJpyc>');
    process.exit(1);
  }
  const amountJpyc = Number(amount);
  console.log(`transferring ${amountJpyc} JPYC to ${to} ...`);
  const result = await transferJpyc({ to, amountJpyc });
  console.log('done:', {
    txHash: result.txHash,
    blockNumber: result.blockNumber.toString(),
    from: result.from,
    to: result.to,
    explorer: explorerTxUrl(result.txHash, env.polygonChainId()),
  });
  const bal = await getBalance(result.from);
  console.log('sender balance now:', bal.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
