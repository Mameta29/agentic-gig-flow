import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../lib/env.js';
import { getSecret } from '../lib/key-vault.js';
import {
  extractOrderIdFromIssueBody,
  getIssueBody,
  getPr,
  verifyWebhookSignature,
  waitForCheckRun,
} from '../lib/github.js';
import { logger } from '../lib/logger.js';
import { createTenantScopedCosmos } from '../lib/cosmos.js';
import { runReview } from '../agents/review.js';
import { runSettlement } from '../agents/settlement.js';
import { runBookkeeping } from '../agents/bookkeeping.js';
import { publish } from '../lib/sse.js';

type DeliveryRecord = {
  id: string; // delivery id (partition key for events container)
  orderId: string;
  type: string;
  payload: { deliveryId: string };
  createdAt: string;
};

async function isDuplicateDelivery(
  deliveryId: string,
  orderId: string,
): Promise<boolean> {
  // We piggy-back on the events container with a synthetic record keyed by
  // delivery id. That way duplicates are guarded purely by Cosmos uniqueness.
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const container = client.database(env.cosmosDatabase()).container('events');
  try {
    const doc: DeliveryRecord = {
      id: `delivery:${deliveryId}`,
      orderId,
      type: 'webhook_delivery_seen',
      payload: { deliveryId },
      createdAt: new Date().toISOString(),
    };
    await container.items.create(doc);
    return false;
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 409) return true;
    throw err;
  }
}

app.http('githubWebhook', {
  methods: ['POST'],
  route: 'webhook/github',
  authLevel: 'function',
  handler: handleGithubWebhook,
});

export async function handleGithubWebhook(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const eventName = req.headers.get('x-github-event') || '';
  const deliveryId = req.headers.get('x-github-delivery') || '';

  let secret: string;
  try {
    secret = await getSecret(env.githubWebhookSecretName());
  } catch (err) {
    logger.error({ err: String(err) }, 'cannot load webhook secret');
    return { status: 500, body: 'webhook secret unavailable' };
  }

  if (!(await verifyWebhookSignature(raw, sig, secret))) {
    logger.warn({ deliveryId }, 'invalid webhook signature');
    return { status: 401, body: 'bad signature' };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, body: 'bad json' };
  }

  ctx.log(`github webhook event=${eventName} delivery=${deliveryId}`);

  if (eventName === 'pull_request') {
    return handlePullRequest(body, deliveryId);
  }
  if (eventName === 'check_run') {
    // Could re-trigger review when CI finishes; for the hackathon demo we keep
    // it simple and rely on PR open/synchronize events.
    return { status: 200, body: 'ack' };
  }
  if (eventName === 'ping') {
    return { status: 200, body: 'pong' };
  }
  return { status: 200, body: 'ignored' };
}

type PullRequestPayload = {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    head: { sha: string };
    base: { repo: { full_name: string } };
    merged: boolean;
    merge_commit_sha: string | null;
    closed_at: string | null;
  };
  repository: { full_name: string };
};

async function handlePullRequest(
  body: Record<string, unknown>,
  deliveryId: string,
): Promise<HttpResponseInit> {
  const payload = body as unknown as PullRequestPayload;
  const action = payload.action;
  const pr = payload.pull_request;
  const repository = payload.repository.full_name;

  // We only act on these actions:
  if (
    action !== 'opened' &&
    action !== 'synchronize' &&
    action !== 'closed'
  ) {
    return { status: 200, body: 'ignored action' };
  }

  // Find the order via the issue linked from the PR body or comments. For the
  // demo we rely on the PR body containing the same hidden marker, OR on
  // listing open issues authored by gigflow and matching by PR title.
  const orderId =
    extractOrderIdFromIssueBody(pr.body ?? '') ||
    (await tryResolveOrderIdFromLinkedIssue(repository, pr.body ?? ''));
  if (!orderId) {
    logger.warn({ repository, prNumber: pr.number }, 'no orderId on PR; ignoring');
    return { status: 200, body: 'no order id' };
  }

  if (await isDuplicateDelivery(deliveryId, orderId)) {
    logger.info({ deliveryId, orderId }, 'duplicate delivery; skipping');
    return { status: 200, body: 'duplicate' };
  }

  // For the cosmos lookup we need the tenantId. We do a cheap cross-partition
  // query on `id`.
  const tenantId = await resolveTenantForOrder(orderId);
  if (!tenantId) {
    logger.warn({ orderId }, 'order not found; ignoring webhook');
    return { status: 200, body: 'no order' };
  }
  const cosmos = createTenantScopedCosmos(tenantId);

  if (action === 'opened' || action === 'synchronize') {
    if (action === 'opened') {
      await safeTransition(cosmos, orderId, 'pr_opened', {
        prNumber: pr.number,
        prUrl: `https://github.com/${repository}/pull/${pr.number}`,
      });
      await cosmos.appendEvent({
        orderId,
        agent: 'review',
        type: 'pr_opened',
        payload: { prNumber: pr.number, repository },
      });
    }

    const ciStatus = await waitForCheckRun({ repository, ref: pr.head.sha });
    const order = await cosmos.getOrder(orderId);
    if (!order) return { status: 200, body: 'order vanished' };

    try {
      const review = await runReview({
        tenantId,
        order,
        repository,
        prNumber: pr.number,
        ciStatus,
      });
      publish(tenantId, {
        orderId,
        type: 'review_completed',
        payload: { verdict: review.verdict, qualityScore: review.qualityScore },
      });
    } catch (err) {
      logger.error({ err: String(err), orderId }, 'review failed');
      await cosmos.appendEvent({
        orderId,
        agent: 'review',
        type: 'review_failed',
        payload: { error: String(err) },
      });
    }
    return { status: 202, body: 'review processed' };
  }

  // action === 'closed'
  if (!pr.merged) {
    return { status: 200, body: 'closed but not merged' };
  }

  // Run settlement → bookkeeping. Errors logged & event-written, but we always
  // return 2xx so GitHub does not retry forever.
  try {
    const settlement = await runSettlement({
      tenantId,
      orderId,
      prMergeEvent: {
        prNumber: pr.number,
        mergeCommitSha: pr.merge_commit_sha ?? '',
        mergedAt: pr.closed_at ?? new Date().toISOString(),
      },
    });
    publish(tenantId, {
      orderId,
      type: 'settlement_completed',
      payload: settlement,
    });

    const order = await cosmos.getOrder(orderId);
    if (order) {
      await runBookkeeping({
        tenantId,
        order,
        settlement,
      });
      publish(tenantId, {
        orderId,
        type: 'bookkeeping_completed',
        payload: {},
      });
    }
  } catch (err) {
    logger.error({ err: String(err), orderId }, 'settlement/bookkeeping failed');
  }

  return { status: 202, body: 'merge processed' };
}

async function safeTransition(
  cosmos: ReturnType<typeof createTenantScopedCosmos>,
  orderId: string,
  to: 'pr_opened' | 'review_passed' | 'review_failed' | 'settled',
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await cosmos.transitionOrder(orderId, to, patch);
  } catch (err) {
    // tolerate "invalid transition" — likely concurrent webhook races
    logger.warn({ err: String(err), orderId, to }, 'transition skipped');
  }
}

async function tryResolveOrderIdFromLinkedIssue(
  repository: string,
  prBody: string,
): Promise<string | undefined> {
  // Attempt to extract a #<n> reference and pull the issue body.
  const m = prBody.match(/#(\d+)/);
  if (!m) return undefined;
  try {
    const issueBody = await getIssueBody({
      repository,
      issueNumber: Number(m[1]),
    });
    return extractOrderIdFromIssueBody(issueBody);
  } catch {
    return undefined;
  }
}

async function resolveTenantForOrder(orderId: string): Promise<string | undefined> {
  // Cross-partition query. Cheap because `orders` is small for the demo.
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const { resources } = await client
    .database(env.cosmosDatabase())
    .container('orders')
    .items.query<{ companyId: string }>({
      query: 'SELECT c.companyId FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: orderId }],
    })
    .fetchAll();
  return resources[0]?.companyId;
}
