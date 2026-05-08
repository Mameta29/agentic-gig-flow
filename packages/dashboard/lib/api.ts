import { auth } from './auth';

const FUNCTIONS_BASE_URL =
  process.env.FUNCTIONS_BASE_URL || 'http://localhost:7071';

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await auth();
  if (!session?.accessToken) {
    throw new Error('not authenticated');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${FUNCTIONS_BASE_URL}${path}`, { ...init, headers, cache: 'no-store' });
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
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  return res.json();
}

export function functionsBaseUrl(): string {
  return FUNCTIONS_BASE_URL;
}
