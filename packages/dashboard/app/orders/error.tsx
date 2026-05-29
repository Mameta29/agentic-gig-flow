'use client';

import Link from 'next/link';

export default function OrdersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="space-y-4 py-10 text-center">
      <h2 className="text-lg font-semibold">注文情報の読み込みに失敗しました</h2>
      <p className="text-sm text-neutral-600">
        一時的な問題の可能性があります。再試行するか、サインインし直してください。
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded bg-neutral-800 px-4 py-1.5 text-sm text-white"
        >
          再試行
        </button>
        <Link
          href="/api/auth/signin"
          className="rounded border border-neutral-300 px-4 py-1.5 text-sm"
        >
          サインインし直す
        </Link>
      </div>
    </main>
  );
}
