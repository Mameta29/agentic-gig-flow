import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createOrder, CreateOrderError, AuthExpiredError } from '@/lib/api';
import { classifyOrderError } from '@/lib/order-errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: classifyOrderError(401, '') },
      { status: 401 },
    );
  }
  const body = (await req.json()) as { rawDescription?: string };
  if (!body.rawDescription) {
    return NextResponse.json(
      {
        error: {
          code: 'missing_info',
          title: '入力が空です',
          detail: '発注内容を入力してください。',
        },
      },
      { status: 400 },
    );
  }
  try {
    const out = await createOrder({ rawDescription: body.rawDescription });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      return NextResponse.json(
        { error: classifyOrderError(401, '') },
        { status: 401 },
      );
    }
    if (e instanceof CreateOrderError) {
      const view = classifyOrderError(e.status, e.bodyText);
      return NextResponse.json({ error: view }, { status: e.status });
    }
    return NextResponse.json(
      { error: classifyOrderError(500, String(e)) },
      { status: 502 },
    );
  }
}
