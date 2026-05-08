import Link from 'next/link';
import { auth, signIn } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth();
  if (!session) {
    return (
      <main className="mx-auto max-w-2xl py-16 text-center">
        <h2 className="mb-3 text-2xl font-semibold">サインイン</h2>
        <p className="mb-8 text-neutral-600">
          Microsoft Entra ID で社内アカウントから入ってください。
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('microsoft-entra-id', { redirectTo: '/orders' });
          }}
        >
          <button className="rounded-md bg-[var(--gigflow-blue)] px-6 py-3 text-white font-medium">
            Microsoft アカウントでサインイン
          </button>
        </form>
      </main>
    );
  }
  return (
    <main className="space-y-6">
      <p>
        ようこそ、{session.user?.name ?? 'PM'} さん。テナント:{' '}
        <code className="rounded bg-neutral-200 px-1">
          {session.tenantId}
        </code>
      </p>
      <div className="flex gap-3">
        <Link
          href="/orders/new"
          className="rounded bg-[var(--gigflow-pink)] px-4 py-2 text-white font-medium"
        >
          + 新規発注
        </Link>
        <Link
          href="/orders"
          className="rounded border px-4 py-2 hover:bg-neutral-100"
        >
          注文一覧
        </Link>
      </div>
    </main>
  );
}
