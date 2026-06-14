import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { verifyEntraToken, AuthError } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { createTenantScopedCosmos } from '../lib/cosmos.js';

app.http('ordersEvents', {
  methods: ['GET'],
  route: 'orders/{id}/events',
  authLevel: 'anonymous',
  handler,
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
    const orderId = req.params.id;
    if (!orderId) {
      return { status: 400, jsonBody: { error: 'missing_order_id' } };
    }

    const cosmos = createTenantScopedCosmos(auth.tenantId);
    // Tenant isolation: getOrder enforces companyId === tenantId, so an order
    // from another tenant returns null → 404 (we never expose its events).
    const order = await cosmos.getOrder(orderId);
    if (!order) {
      return { status: 404, jsonBody: { error: 'order_not_found' } };
    }

    const events = await cosmos.listEvents(orderId);
    // Hide internal webhook-dedup synthetic records (id `delivery:<guid>`,
    // type `webhook_delivery_seen`) — they are not part of the order lifecycle.
    const lifecycle = events.filter(
      (e) => e.type !== ('webhook_delivery_seen' as typeof e.type),
    );
    return { status: 200, jsonBody: { events: lifecycle } };
  } catch (err) {
    if (err instanceof AuthError) {
      return { status: err.status, jsonBody: { error: err.code } };
    }
    return { status: 500, jsonBody: { error: String(err) } };
  }
}
