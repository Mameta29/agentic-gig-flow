'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderErrorView } from '@/lib/order-errors';

// Sample prompts that include every field Contract Agent needs to succeed:
// worker name, amount (JPYC), deadline (relative), description, repository.
// Judges can click these instead of having to guess the right phrasing.
const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'ログイン機能 / 5万 JPYC / 2週間後',
    text:
      'Sato さんに ログイン機能の実装 を 50,000 JPYC で 2週間後 までにお願いします。リポジトリは demo/workspace。受け入れ基準: メール+パスワードでサインインできる、エラー時にトーストが出る。',
  },
  {
    label: 'バグ修正 / 3万 JPYC / 1週間後',
    text:
      'Sato さんに 注文一覧画面のページングが効かない不具合の修正 を 30,000 JPYC で 1週間後 までお願いします。リポジトリは demo/workspace。受け入れ基準: 100件以上のデータでも次ページに進める。',
  },
  {
    label: 'リファクタ / 8万 JPYC / 3週間後',
    text:
      'Sato さんに 認証ミドルウェアのリファクタリング を 80,000 JPYC で 3週間後 までお願いします。リポジトリは demo/workspace。受け入れ基準: 既存テストがすべて通る、新規ユニットテスト追加。',
  },
];

// Seed-known workers (packages/functions/scripts/seed-cosmos.ts). Showing this
// inline removes the "後藤さんに頼みたい → unknown_worker で 502" failure mode
// during judge demos.
const KNOWN_WORKERS = [
  { displayName: 'Sato Taro', githubLogin: 'sato-taro', note: 'デモ用フリーランサー' },
];

export default function NewOrderPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<OrderErrorView | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        body: JSON.stringify({ rawDescription: text }),
        headers: { 'Content-Type': 'application/json' },
      });
      const j = (await res.json().catch(() => ({}))) as
        | { orderId: string }
        | { error: OrderErrorView };
      if (!res.ok) {
        if ('error' in j && j.error) {
          setErr(j.error);
        } else {
          setErr({
            code: 'unknown',
            title: '発注に失敗しました',
            detail: `HTTP ${res.status} が返されました。`,
          });
        }
        return;
      }
      const out = j as { orderId: string };
      router.push(`/orders/${out.orderId}`);
    } catch (e) {
      setErr({
        code: 'unknown',
        title: '通信エラー',
        detail: String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-xl font-semibold">新規発注</h2>
      <p className="mb-4 text-sm text-neutral-600">
        自然言語で書くだけで Contract Agent が GitHub Issue を起こします。
        <span className="text-neutral-500">
          {' '}受注者名・金額・期日・業務内容を含めてください。
        </span>
      </p>

      <section className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <div className="mb-2 text-xs font-semibold text-neutral-700">
          登録済みの受注者
        </div>
        <ul className="space-y-1 text-sm">
          {KNOWN_WORKERS.map((w) => (
            <li key={w.githubLogin} className="flex items-center gap-2">
              <span className="font-medium">{w.displayName}</span>
              <span className="text-neutral-500">@{w.githubLogin}</span>
              <span className="ml-auto text-xs text-neutral-500">{w.note}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 text-xs text-neutral-500">
          ここに無い名前 (例: 後藤さん) を指定すると「受注者が登録されていません」エラーになります。
        </div>
      </section>

      <section className="mb-3">
        <div className="mb-2 text-xs font-semibold text-neutral-700">
          サンプル (クリックで入力欄に挿入)
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.text)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-[var(--gigflow-blue)] hover:text-[var(--gigflow-blue)]"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="例: Sato さんに ログイン機能 を 50,000 JPYC で 2週間後 までお願い。リポジトリは demo/workspace。"
        className="w-full resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
      />

      {err && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm"
        >
          <div className="font-semibold text-red-800">{err.title}</div>
          <div className="mt-1 text-red-700">{err.detail}</div>
          {err.hint && (
            <div className="mt-1 text-red-700">
              <span className="font-medium">ヒント: </span>
              {err.hint}
            </div>
          )}
          {err.code === 'unknown_worker' && (
            <div className="mt-2 text-red-700">
              使える受注者:{' '}
              {KNOWN_WORKERS.map((w) => (
                <code
                  key={w.githubLogin}
                  className="ml-1 rounded bg-white px-1 py-0.5 text-xs text-red-800"
                >
                  {w.displayName}
                </code>
              ))}
            </div>
          )}
          {err.code === 'missing_info' && (
            <button
              type="button"
              onClick={() => SAMPLES[0] && setText(SAMPLES[0].text)}
              className="mt-2 rounded border border-red-400 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-100"
            >
              サンプル文を入力欄に挿入する
            </button>
          )}
          {err.raw && (
            <details className="mt-2 text-xs text-red-600">
              <summary className="cursor-pointer">技術的な詳細</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{err.raw}</pre>
            </details>
          )}
          {err.code === 'auth_expired' && (
            <a
              href="/api/auth/signin"
              className="mt-2 inline-block rounded border border-red-400 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-100"
            >
              再サインインする
            </a>
          )}
        </div>
      )}

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
