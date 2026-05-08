/**
 * Tiny in-memory pub/sub for SSE. Single Function App instance only — for the
 * hackathon demo this is fine. For HA scale-out, swap to Redis or Service Bus.
 */
type Listener = (event: { orderId: string; type: string; payload: unknown }) => void;

const listeners = new Map<string, Set<Listener>>(); // tenantId -> listeners

export function subscribe(tenantId: string, listener: Listener): () => void {
  let set = listeners.get(tenantId);
  if (!set) {
    set = new Set();
    listeners.set(tenantId, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

export function publish(
  tenantId: string,
  event: { orderId: string; type: string; payload: unknown },
): void {
  const set = listeners.get(tenantId);
  if (!set) return;
  for (const l of set) {
    try {
      l(event);
    } catch {
      /* ignore */
    }
  }
}
