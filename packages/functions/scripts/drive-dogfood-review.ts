/**
 * Drive the REAL Review → (auto-merge) pipeline for a dogfood order from the
 * command line, with ciStatus forced to the value the caller passes (we verify
 * CI is green out-of-band first). This bypasses the GitHub webhook, whose
 * synchronous invocation can be killed by the Functions host before gpt-5.1
 * finishes — it runs the identical agent code, just not under the host timeout.
 *
 * Settlement + Bookkeeping are intentionally NOT run here; if the review
 * auto-merges, the `closed(merged)` webhook fires settlement as usual. Run with
 * RUN_SETTLEMENT=1 to additionally drive settlement+bookkeeping locally.
 */
import { createTenantScopedCosmos } from '../src/lib/cosmos.js';
import { runReview } from '../src/agents/review.js';
import { runSettlement } from '../src/agents/settlement.js';
import { runBookkeeping } from '../src/agents/bookkeeping.js';

async function main() {
  const tenantId = process.env.TENANT_ID!;
  const orderId = process.env.ORDER_ID!;
  const ciStatus = (process.env.CI_STATUS || 'success') as
    | 'success'
    | 'failure'
    | 'pending';

  const cosmos = createTenantScopedCosmos(tenantId);
  const order = await cosmos.getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found in tenant ${tenantId}`);
  console.log('order before:', {
    status: order.status,
    prNumber: order.prNumber,
    repository: order.repository,
  });
  if (!order.prNumber) throw new Error('order has no prNumber');

  console.log(`\n=== runReview (ciStatus=${ciStatus}) ===`);
  const review = await runReview({
    tenantId,
    order,
    repository: order.repository,
    prNumber: order.prNumber,
    ciStatus,
  });
  console.log('verdict:', review.verdict);
  console.log('qualityScore:', review.qualityScore);
  console.log('autoMerge:', review.autoMerge);
  for (const c of review.criteriaResults) {
    console.log(`  [${c.met ? '✓' : '✗'}] ${c.criterion}`);
  }

  const after = await cosmos.getOrder(orderId);
  console.log('\norder after review:', { status: after?.status });

  if (process.env.RUN_SETTLEMENT === '1' && after?.status === 'review_passed') {
    console.log('\n=== runSettlement ===');
    const settlement = await runSettlement({
      tenantId,
      orderId,
      prMergeEvent: {
        prNumber: order.prNumber,
        mergeCommitSha: '',
        mergedAt: new Date().toISOString(),
      },
    });
    console.log('settlement:', settlement);

    const settledOrder = await cosmos.getOrder(orderId);
    if (settledOrder) {
      console.log('\n=== runBookkeeping ===');
      await runBookkeeping({ tenantId, order: settledOrder, settlement });
      const done = await cosmos.getOrder(orderId);
      console.log('order final:', { status: done?.status, txHash: done?.txHash });
    }
  }
}

main().catch((e) => {
  console.error('DRIVE_ERR:', e?.stack || e?.message || String(e));
  process.exit(1);
});
