'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewOrderPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        body: JSON.stringify({ rawDescription: text }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message || `failed: ${res.status}`);
      }
      const out = (await res.json()) as { orderId: string };
      router.push(`/orders/${out.orderId}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl">
      <h2 className="mb-4 text-xl font-semibold">新規発注</h2>
      <p className="mb-3 text-sm text-neutral-600">
        自然言語で書くだけで Contract Agent が GitHub Issue を起こします。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Sato さんに ログイン機能 を 5万JPYC 2週間後 でお願い。リポジトリ demo/workspace。"
        className="w-full resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
      />
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <div className="mt-4 flex justify-end">
        <button
          disabled={!text || submitting}
          onClick={submit}
          className="rounded bg-[var(--gigflow-pink)] px-5 py-2 text-white font-medium disabled:bg-neutral-300"
        >
          {submitting ? '送信中…' : '発注する'}
        </button>
      </div>
    </main>
  );
}
