import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createOrder } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json()) as { rawDescription?: string };
  if (!body.rawDescription) {
    return NextResponse.json({ error: 'rawDescription required' }, { status: 400 });
  }
  try {
    const out = await createOrder({ rawDescription: body.rawDescription });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
