export type AgentName =
  | 'contract'
  | 'review'
  | 'settlement'
  | 'bookkeeping'
  | 'mcp';

export type EventType =
  | 'order_created'
  | 'issue_created'
  | 'pr_opened'
  | 'review_started'
  | 'review_completed'
  | 'review_failed'
  | 'pr_merged'
  | 'settlement_started'
  | 'settlement_completed'
  | 'settlement_failed'
  | 'bookkeeping_started'
  | 'bookkeeping_completed'
  | 'mcp_query'
  | 'copilot_card_sent';

export type GigflowEvent = {
  id: string;
  orderId: string;
  agent?: AgentName;
  type: EventType;
  payload: Record<string, unknown>;
  actorId?: string;
  createdAt: string;
};
