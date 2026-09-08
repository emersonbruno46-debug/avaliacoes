import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminToken, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);

  const isAuthenticated = Boolean(
    sessionCookie && sessionCookie.value === getAdminToken()
  );

  return NextResponse.json(
    { authenticated: isAuthenticated },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}
