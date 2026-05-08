import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Agentic Gig-Flow',
  description: '副業3,000万人時代の月末経理を消す',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <header className="mb-8 flex items-center justify-between border-b pb-4">
            <h1 className="text-xl font-semibold tracking-tight">
              Agentic Gig-Flow
            </h1>
            <a
              href="/orders"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              注文一覧
            </a>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
