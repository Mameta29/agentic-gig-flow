import type { Order } from '@gigflow/shared';
import {
  transferJpyc as defaultTransferJpyc,
  type TransferResult,
} from '../lib/blockchain.js';
import {
  createTenantScopedCosmos,
  type TenantScopedCosmos,
} from '../lib/cosmos.js';
import { logger } from '../lib/logger.js';
import { trackEvent, trackException } from '../lib/telemetry.js';

export const MAX_AMOUNT_PER_TX = 100_000;
export const MAX_TX_PER_DAY_PER_AGENT = 10;
const ALLOWED_RECIPIENTS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export type SettlementAgentInput = {
  tenantId: string;
  orderId: string;
  prMergeEvent: {
    prNumber: number;
    mergeCommitSha: string;
    mergedAt: string;
  };
};

export type SettlementAgentOutput = {
  orderId: string;
  txHash: string;
  blockNumber: number;
  amountJpyc: number;
  recipient: string;
  settledAt: string;
};

export type SettlementDeps = {
  cosmos?: TenantScopedCosmos;
  transferJpyc?: (opts: {
    to: string;
    amountJpyc: number;
  }) => Promise<TransferResult>;
  now?: () => Date;
};

class GuardrailError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'GuardrailError';
  }
}

export async function preTransferChecks(
  order: Order,
  cosmos: TenantScopedCosmos,
  now: Date,
): Promise<void> {
  if (!Number.isInteger(order.amountJpyc) || order.amountJpyc <= 0) {
    throw new GuardrailError('bad_amount', `bad amount: ${order.amountJpyc}`);
  }
  if (order.amountJpyc > MAX_AMOUNT_PER_TX) {
    throw new GuardrailError(
      'amount_exceeded',
      `amount exceeds per-tx limit: ${order.amountJpyc} > ${MAX_AMOUNT_PER_TX}`,
    );
  }
  if (!ALLOWED_RECIPIENTS_REGEX.test(order.workerWallet)) {
    throw new GuardrailError(
      'bad_address',
      `bad recipient address: ${order.workerWallet}`,
    );
  }

  // Daily tx limit (settled orders for this tenant in the past 24h).
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await cosmos.listOrders({ status: 'settled', limit: 100 });
  const dailyCount = recent.filter(
    (o) => o.settledAt && o.settledAt > yesterday,
  ).length;
  if (dailyCount >= MAX_TX_PER_DAY_PER_AGENT) {
    throw new GuardrailError(
      'daily_limit',
      `daily settlement limit reached: ${dailyCount}/${MAX_TX_PER_DAY_PER_AGENT}`,
    );
  }
}

export async function runSettlement(
  input: SettlementAgentInput,
  deps: SettlementDeps = {},
): Promise<SettlementAgentOutput> {
  const cosmos = deps.cosmos ?? createTenantScopedCosmos(input.tenantId);
  const transfer = deps.transferJpyc ?? defaultTransferJpyc;
  const now = deps.now ?? (() => new Date());

  const order = await cosmos.getOrder(input.orderId);
  if (!order) throw new Error(`order_not_found: ${input.orderId}`);

  // Idempotency: refuse if already settled (txHash present or status >= settled).
  if (
    order.txHash ||
    order.status === 'settled' ||
    order.status === 'bookkept'
  ) {
    throw new Error('already_settled');
  }

  if (order.status !== 'review_passed') {
    throw new Error(`invalid_status: ${order.status}`);
  }

  await preTransferChecks(order, cosmos, now());

  await cosmos.appendEvent({
    orderId: order.id,
    agent: 'settlement',
    type: 'settlement_started',
    payload: {
      prNumber: input.prMergeEvent.prNumber,
      amountJpyc: order.amountJpyc,
    },
  });
  trackEvent('settlement_started', {
    orderId: order.id,
    tenantId: input.tenantId,
    amountJpyc: order.amountJpyc,
  });

  let result: TransferResult;
  try {
    result = await transfer({
      to: order.workerWallet,
      amountJpyc: order.amountJpyc,
    });
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'settlement transfer failed');
    await cosmos.appendEvent({
      orderId: order.id,
      agent: 'settlement',
      type: 'settlement_failed',
      payload: { error: String(err) },
    });
    trackException(err, { orderId: order.id, tenantId: input.tenantId });
    throw err;
  }

  const settledAt = now().toISOString();
  await cosmos.transitionOrder(order.id, 'settled', {
    txHash: result.txHash,
    blockNumber: Number(result.blockNumber),
    settledAt,
  });

  await cosmos.appendEvent({
    orderId: order.id,
    agent: 'settlement',
    type: 'settlement_completed',
    payload: {
      txHash: result.txHash,
      blockNumber: result.blockNumber.toString(),
      amountJpyc: order.amountJpyc,
      recipient: order.workerWallet,
    },
  });
  // Headline metric: time from GitHub merge to JPYC arrival on-chain.
  // mergedAt comes straight from the PR merge webhook payload, so this measures
  // the full "merge -> settled" latency the demo claims is ~3 seconds.
  const mergedAtMs = Date.parse(input.prMergeEvent.mergedAt);
  const measurements: Record<string, number> = Number.isNaN(mergedAtMs)
    ? {}
    : { mergeToSettledMs: Math.max(0, Date.parse(settledAt) - mergedAtMs) };
  trackEvent(
    'settlement_completed',
    {
      orderId: order.id,
      tenantId: input.tenantId,
      txHash: result.txHash,
      amountJpyc: order.amountJpyc,
    },
    measurements,
  );

  logger.info(
    {
      orderId: order.id,
      txHash: result.txHash,
      amountJpyc: order.amountJpyc,
    },
    'settlement completed',
  );

  return {
    orderId: order.id,
    txHash: result.txHash,
    blockNumber: Number(result.blockNumber),
    amountJpyc: order.amountJpyc,
    recipient: order.workerWallet,
    settledAt,
  };
}
