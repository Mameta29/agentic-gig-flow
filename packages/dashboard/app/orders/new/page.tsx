'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderErrorView } from '@/lib/order-errors';
import { composeOrderText } from './compose';

// Live values verified against production Cosmos (scripts/inspect-tenant.ts /
// scripts/seed-dogfood.ts). displayName is what shows in the UI / what the PM
// types in natural language; githubLogin is what Contract Agent puts on the
// Issue assignee.
const KNOWN_WORKERS = [
  {
    displayName: 'Sato Taro',
    githubLogin: 'ei-chan-bot',
    note: 'デモ用フリーランサー (GitHub: ei-chan-bot)',
  },
  {
    displayName: 'Mameta29',
    githubLogin: 'Mameta29',
    note: 'dogfooding: 開発者本人 (seed-dogfood.ts で登録)',
  },
] as const;

const KNOWN_REPOSITORIES = [
  'Mameta29/gigflow-demo-workspace',
  'Mameta29/agentic-gig-flow',
] as const;

// Deadline presets keep the natural-language phrasing Contract Agent already
// parses well ("2週間後" 等)。datalist なので自由入力もできる。
const DEADLINE_PRESETS = ['1週間後', '2週間後', '3週間後', '1ヶ月後'] as const;

// Sample prompts that include every field Contract Agent needs to succeed:
// worker name, amount (JPYC), deadline (relative), description, repository.
const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'ログイン機能 / 5万 JPYC / 2週間後',
    text:
      'Sato さんに ログイン機能の実装 を 50,000 JPYC で 2週間後 までにお願いします。リポジトリは Mameta29/gigflow-demo-workspace。受け入れ基準: メール+パスワードでサインインできる、エラー時にトーストが出る。',
  },
  {
    label: 'バグ修正 / 3万 JPYC / 1週間後',
    text:
      'Sato さんに 注文一覧画面のページングが効かない不具合の修正 を 30,000 JPYC で 1週間後 までお願いします。リポジトリは Mameta29/gigflow-demo-workspace。受け入れ基準: 100件以上のデータでも次ページに進める。',
  },
  {
    label: 'リファクタ / 8万 JPYC / 3週間後',
    text:
      'Sato さんに 認証ミドルウェアのリファクタリング を 80,000 JPYC で 3週間後 までお願いします。リポジトリは Mameta29/gigflow-demo-workspace。受け入れ基準: 既存テストがすべて通る、新規ユニットテスト追加。',
  },
  {
    label: '【dogfood】Dashboard改善 / 5万 JPYC / 1週間後',
    text:
      'Mameta29 さんに Dashboard 経理確認画面の UI/UX 改善 を 50,000 JPYC で 1週間後 までお願いします。リポジトリは Mameta29/agentic-gig-flow。受け入れ基準: 既存テストがすべて通る、CI が通過している、変更がレビュー基準を満たす。',
  },
];

export default function NewOrderPage() {
  const router = useRouter();

  // Structured selections compose the natural-language text below, which stays
  // the single source of truth sent to Contract Agent (NL entry preserved).
  const [workerLogin, setWorkerLogin] = useState<string>(
    KNOWN_WORKERS[0].githubLogin,
  );
  const [repository, setRepository] = useState<string>(KNOWN_REPOSITORIES[0]);
  const [amountJpyc, setAmountJpyc] = useState<string>('50000');
  const [deadline, setDeadline] = useState<string>(DEADLINE_PRESETS[1]);
  const [description, setDescription] = useState<string>('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string>('');

  // When the PM edits the textarea (or picks a sample) we stop overwriting it
  // from the form, so power users keep full natural-language control.
  const [manualText, setManualText] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<OrderErrorView | null>(null);

  const selectedWorker =
    KNOWN_WORKERS.find((w) => w.githubLogin === workerLogin) ?? KNOWN_WORKERS[0];

  const composed = useMemo(
    () =>
      composeOrderText({
        workerDisplayName: selectedWorker.displayName,
        repository,
        amountJpyc,
        deadline,
        description,
        acceptanceCriteria,
      }),
    [
      selectedWorker.displayName,
      repository,
      amountJpyc,
      deadline,
      description,
      acceptanceCriteria,
    ],
  );

  const text = manualText ?? composed;

  // Reset back to form-driven composition.
  function useFormText() {
    setManualText(null);
  }

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
        受注者とリポジトリを選び、業務内容を書くだけ。Contract Agent が
        GitHub Issue を起こします。
        <span className="text-neutral-500">
          {' '}下の発注文はそのまま編集もできます (自然言語入力)。
        </span>
      </p>

      {/* Structured selectors remove the typo class of "登録されていません" errors. */}
      <section className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            受注者
          </span>
          <select
            aria-label="受注者"
            value={workerLogin}
            onChange={(e) => {
              setWorkerLogin(e.target.value);
              useFormText();
            }}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          >
            {KNOWN_WORKERS.map((w) => (
              <option key={w.githubLogin} value={w.githubLogin}>
                {w.displayName} (@{w.githubLogin})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            {selectedWorker.note}
          </span>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            リポジトリ
          </span>
          <select
            aria-label="リポジトリ"
            value={repository}
            onChange={(e) => {
              setRepository(e.target.value);
              useFormText();
            }}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          >
            {KNOWN_REPOSITORIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            このテナントで許可されているリポジトリ
          </span>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            金額 (JPYC)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="金額 (JPYC)"
            value={amountJpyc}
            onChange={(e) => {
              setAmountJpyc(e.target.value);
              useFormText();
            }}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            期日
          </span>
          <input
            list="deadline-presets"
            aria-label="期日"
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value);
              useFormText();
            }}
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          />
          <datalist id="deadline-presets">
            {DEADLINE_PRESETS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
      </section>

      <section className="mb-3 grid grid-cols-1 gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            業務内容
          </span>
          <input
            aria-label="業務内容"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              useFormText();
            }}
            placeholder="例: ログイン機能の実装"
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700">
            受け入れ基準 (任意)
          </span>
          <input
            aria-label="受け入れ基準"
            value={acceptanceCriteria}
            onChange={(e) => {
              setAcceptanceCriteria(e.target.value);
              useFormText();
            }}
            placeholder="例: 既存テストがすべて通る、CIが通過している"
            className="w-full rounded-md border border-neutral-300 bg-white p-2 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
          />
        </label>
      </section>

      <section className="mb-3">
        <div className="mb-2 text-xs font-semibold text-neutral-700">
          サンプル (クリックで発注文に挿入)
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setManualText(s.text)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-[var(--gigflow-blue)] hover:text-[var(--gigflow-blue)]"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <label className="text-sm">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold text-neutral-700">
          発注文 (送信される自然言語)
          {manualText !== null && (
            <button
              type="button"
              onClick={useFormText}
              className="text-xs font-normal text-[var(--gigflow-blue)] hover:underline"
            >
              フォームの内容に戻す
            </button>
          )}
        </span>
        <textarea
          value={text}
          onChange={(e) => setManualText(e.target.value)}
          rows={4}
          placeholder="例: Sato さんに ログイン機能 を 50,000 JPYC で 2週間後 までお願い。リポジトリは Mameta29/gigflow-demo-workspace。"
          className="w-full resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
        />
      </label>

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
          {err.code === 'unknown_repository' && (
            <div className="mt-2 text-red-700">
              使えるリポジトリ:{' '}
              {KNOWN_REPOSITORIES.map((r) => (
                <code
                  key={r}
                  className="ml-1 rounded bg-white px-1 py-0.5 text-xs text-red-800"
                >
                  {r}
                </code>
              ))}
            </div>
          )}
          {err.code === 'missing_info' && (
            <button
              type="button"
              onClick={() => SAMPLES[0] && setManualText(SAMPLES[0].text)}
              className="mt-2 rounded border border-red-400 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-100"
            >
              サンプル文を発注文に挿入する
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
