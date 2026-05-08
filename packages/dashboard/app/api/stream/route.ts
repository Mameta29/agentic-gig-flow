// Server-side proxy for the Functions SSE endpoint, attaching the user's
// access token. Streams events back to the browser without buffering.
import { auth } from '@/lib/auth';
import { functionsBaseUrl } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return new Response('unauthorized', { status: 401 });
  }
  const upstream = await fetch(`${functionsBaseUrl()}/api/orders/stream`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(`upstream ${upstream.status}`, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
