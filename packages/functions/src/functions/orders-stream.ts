import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { verifyEntraToken, AuthError } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { subscribe } from '../lib/sse.js';

app.http('ordersStream', {
  methods: ['GET'],
  route: 'orders/stream',
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
  } catch (err) {
    if (err instanceof AuthError) {
      return { status: err.status, jsonBody: { error: err.code } };
    }
    return { status: 500, jsonBody: { error: 'internal' } };
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(enc.encode(`data: ${data}\n\n`));
      };
      send(JSON.stringify({ type: 'hello', tenantId: auth!.tenantId }));
      const unsub = subscribe(auth!.tenantId, (ev) => {
        send(JSON.stringify(ev));
      });
      // Ping every 25s to keep the connection alive (Azure default idle 30s).
      const ping = setInterval(() => send('"ping"'), 25_000);
      // We have no client-disconnect hook; rely on platform timeout.
      void ping;
      void unsub;
    },
  });

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
    body: stream,
  };
}
