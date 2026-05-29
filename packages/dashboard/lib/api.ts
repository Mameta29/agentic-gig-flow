import { auth } from './auth';

const FUNCTIONS_BASE_URL =
  process.env.FUNCTIONS_BASE_URL || 'http://localhost:7071';

// Thrown when the session is missing or the Entra access token has expired
// (Functions replies 401). The Entra access_token lives ~1h and is not
// refreshed, so a judge returning later hits this. Pages catch it and redirect
// to sign-in instead of crashing into a blank "Application error" screen.
export class AuthExpiredError extends Error {
  constructor() {
    super('auth expired');
    this.name = 'AuthExpiredError';
  }
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await auth();
  if (!session?.accessToken) {
    throw new AuthExpiredError();
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${FUNCTIONS_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new AuthExpiredError();
  }
  return res;
}

export async function listOrders(filter: {
  status?: string;
  yearMonth?: string;
  worker?: string;
} = {}): Promise<{ orders: unknown[] }> {
  const qs = new URLSearchParams();
  if (filter.status) qs.set('status', filter.status);
  if (filter.yearMonth) qs.set('yearMonth', filter.yearMonth);
  if (filter.worker) qs.set('worker', filter.worker);
  const res = await authedFetch(`/api/orders/list?${qs.toString()}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

export async function createOrder(body: {
  rawDescription: string;
  workerGithubLogin?: string;
  workerWallet?: string;
  repository?: string;
  today?: string;
}): Promise<{
  orderId: string;
  issueNumber: number;
  issueUrl: string;
}> {
  const res = await authedFetch('/api/orders/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Surface the Functions error body (e.g. contract_failed: <reason>) so the
    // dashboard can show *why* create failed.
    const detail = await res.text().catch(() => '');
    throw new Error(`create failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export function functionsBaseUrl(): string {
  return FUNCTIONS_BASE_URL;
}
