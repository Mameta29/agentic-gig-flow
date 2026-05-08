import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { z } from 'zod';
import { verifyEntraToken, AuthError } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { runContract } from '../agents/contract.js';
import { logger } from '../lib/logger.js';
import { requireRole } from '@gigflow/shared';

const BodySchema = z.object({
  rawDescription: z.string().min(1),
  workerGithubLogin: z.string().optional(),
  workerWallet: z.string().optional(),
  repository: z.string().optional(),
  today: z.string().optional(),
  conversationReference: z.unknown().optional(),
});

app.http('ordersCreate', {
  methods: ['POST'],
  route: 'orders/create',
  authLevel: 'anonymous',
  handler: handler,
});

export async function handler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  let auth;
  try {
    auth = await verifyEntraToken(
      req.headers.get('authorization'),
      env.functionsAppAudience(),
    );
    requireRole(auth, 'PM');
  } catch (err) {
    return authErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, jsonBody: { error: parsed.error.flatten() } };
  }

  try {
    const out = await runContract({
      tenantId: auth.tenantId,
      requesterId: auth.userId,
      rawDescription: parsed.data.rawDescription,
      workerGithubLogin: parsed.data.workerGithubLogin,
      workerWallet: parsed.data.workerWallet,
      repository: parsed.data.repository,
      today: parsed.data.today ?? new Date().toISOString().slice(0, 10),
      conversationReference: parsed.data.conversationReference as never,
    });
    return { status: 201, jsonBody: out };
  } catch (err) {
    logger.error({ err: String(err) }, 'orders/create failed');
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

function authErrorResponse(err: unknown): HttpResponseInit {
  if (err instanceof AuthError) {
    return { status: err.status, jsonBody: { error: err.code, message: err.message } };
  }
  return { status: 500, jsonBody: { error: 'internal' } };
}
