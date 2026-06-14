import { z } from 'zod';
import type { BookkeepingArtifacts } from './bookkeeping.js';

export const orderStatuses = [
  'created',
  'in_progress',
  'pr_opened',
  'review_failed',
  'review_passed',
  'settling',
  'settled',
  'bookkept',
  'cancelled',
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const OrderStatusSchema = z.enum(orderStatuses);

export type ConversationReference = {
  conversation: { id: string; tenantId?: string };
  serviceUrl: string;
  channelId: string;
  bot?: { id: string; name?: string };
  user?: { id: string; name?: string };
};

export type Order = {
  id: string;
  companyId: string;
  requesterId: string;
  workerGithubLogin: string;
  workerWallet: string;
  description: string;
  acceptanceCriteria: string[];
  amountJpyc: number;
  deadline: string;
  repository: string;
  issueNumber?: number;
  issueUrl?: string;
  prNumber?: number;
  prUrl?: string;
  status: OrderStatus;
  txHash?: string;
  blockNumber?: number;
  settledAt?: string;
  bookkeepingArtifacts?: BookkeepingArtifacts;
  copilotConversationRef?: ConversationReference;
  createdAt: string;
  updatedAt: string;
  _etag?: string;
};

export const OrderSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().min(1),
  requesterId: z.string().min(1),
  workerGithubLogin: z.string().min(1),
  workerWallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be EVM address'),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(10),
  amountJpyc: z.number().int().positive(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  issueNumber: z.number().int().optional(),
  issueUrl: z.string().url().optional(),
  prNumber: z.number().int().optional(),
  prUrl: z.string().url().optional(),
  status: OrderStatusSchema,
  txHash: z.string().optional(),
  blockNumber: z.number().int().optional(),
  settledAt: z.string().optional(),
  bookkeepingArtifacts: z.unknown().optional(),
  copilotConversationRef: z.unknown().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const transitions: Record<OrderStatus, OrderStatus[]> = {
  created: ['in_progress', 'pr_opened', 'review_passed', 'review_failed', 'cancelled'],
  in_progress: ['pr_opened', 'review_passed', 'review_failed', 'cancelled'],
  pr_opened: ['review_passed', 'review_failed', 'settled', 'cancelled'],
  review_failed: ['pr_opened', 'review_passed', 'cancelled'],
  // `settling` is the atomic claim taken just before the JPYC transfer. Only
  // one concurrent settlement can win the `review_passed -> settling` etag race;
  // the loser fails `canTransition` (status is no longer `review_passed`) and
  // bails before spending. This is what makes double-send structurally
  // impossible rather than merely unlikely.
  review_passed: ['settling', 'settled', 'pr_opened', 'cancelled'],
  // `settling -> review_passed` lets a failed transfer roll the claim back so a
  // retry can settle. `settling -> settled` is the success path.
  settling: ['settled', 'review_passed', 'cancelled'],
  settled: ['bookkept', 'review_passed'],
  bookkept: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return transitions[from]?.includes(to) ?? false;
}
