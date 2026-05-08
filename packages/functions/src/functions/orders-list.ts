import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { verifyEntraToken, AuthError } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { createTenantScopedCosmos } from '../lib/cosmos.js';
import type { OrderStatus } from '@gigflow/shared';

app.http('ordersList', {
  methods: ['GET'],
  route: 'orders/list',
  authLevel: 'anonymous',
  handler: handler,
});

export async function handler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const auth = await verifyEntraToken(
      req.headers.get('authorization'),
      env.functionsAppAudience(),
    );
    const cosmos = createTenantScopedCosmos(auth.tenantId);
    const status = req.query.get('status') ?? undefined;
    const ym = req.query.get('yearMonth') ?? undefined;
    const worker = req.query.get('worker') ?? undefined;
    const limit = Number(req.query.get('limit') ?? 50);

    const orders = await cosmos.listOrders({
      status: status as OrderStatus | undefined,
      yearMonth: ym ?? undefined,
      workerGithubLogin: worker ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return { status: 200, jsonBody: { orders } };
  } catch (err) {
    if (err instanceof AuthError) {
      return { status: err.status, jsonBody: { error: err.code } };
    }
    return { status: 500, jsonBody: { error: String(err) } };
  }
}
