/**
 * Drive the Settlement (and Bookkeeping) stage for the e2e order directly,
 * mirroring exactly what the merged-PR webhook does. Used to verify the
 * on-chain JPYC transfer when a webhook race left the order at review_passed.
 *
 * Reuses the real runSettlement/runBookkeeping so this is the same code path
 * the demo runs, just invoked locally with the function-app env.
 */
import { createTenantScopedCosmos } from '../src/lib/cosmos.js';
import { runSettlement } from '../src/agents/settlement.js';
import { runBookkeeping } from '../src/agents/bookkeeping.js';

async function main() {
  const tenantId = 'demo-tenant-0001';
  const orderId = 'adae02bc-f748-4c4b-8da4-d60f6ca7be82';
  const cosmos = createTenantScopedCosmos(tenantId);

  const before = await cosmos.getOrder(orderId);
  console.log('before:', { status: before?.status, txHash: before?.txHash });

  const settlement = await runSettlement({
    tenantId,
    orderId,
    prMergeEvent: {
      prNumber: 2,
      mergeCommitSha: '',
      mergedAt: new Date().toISOString(),
    },
  });
  console.log('SETTLEMENT:', JSON.stringify(settlement, null, 2));

  const order = await cosmos.getOrder(orderId);
  if (order) {
    await runBookkeeping({ tenantId, order, settlement });
    console.log('bookkeeping done');
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
