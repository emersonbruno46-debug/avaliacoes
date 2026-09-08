import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminToken, COOKIE_NAME } from '@/lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);

  if (sessionCookie && sessionCookie.value === getAdminToken()) {
    return NextResponse.json({ authenticated: true });
  }

  return NextResponse.json({ authenticated: false });
}
