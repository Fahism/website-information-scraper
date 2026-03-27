import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_PING_SECRET;
  if (!secret) return false;

  const headerToken = request.headers.get('x-cron-secret');
  const queryToken = request.nextUrl.searchParams.get('token');

  return headerToken === secret || queryToken === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    warmedAt: new Date().toISOString(),
  });
}
