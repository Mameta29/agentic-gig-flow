'use client';

import { useEffect, useState } from 'react';

type Notice = {
  orderId: string;
  type: string;
  ts: number;
};

export function OrdersStream() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    async function start() {
      // The route hits the same Next host; we just GET it as SSE.
      es = new EventSource('/api/stream');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.orderId && data?.type) {
            setNotices((prev) =>
              [{ orderId: data.orderId, type: data.type, ts: Date.now() }, ...prev].slice(0, 5),
            );
            // Briefly highlight the affected row.
            const row = document.querySelector(
              `tr[data-order-id="${data.orderId}"]`,
            );
            if (row) {
              row.classList.add('bg-emerald-50');
              setTimeout(() => row.classList.remove('bg-emerald-50'), 4000);
            }
          }
        } catch {
          /* noop */
        }
      };
      es.onerror = () => {
        if (cancelled) return;
        es?.close();
        setTimeout(start, 5000);
      };
    }
    start();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  if (notices.length === 0) return null;
  return (
    <div className="mb-4 space-y-1 text-xs text-neutral-600">
      {notices.map((n) => (
        <div key={n.ts}>
          <span className="font-mono text-emerald-700">{n.type}</span>{' '}
          <span className="text-neutral-500">{n.orderId.slice(0, 8)}…</span>
        </div>
      ))}
    </div>
  );
}
