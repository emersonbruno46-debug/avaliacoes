import { validateAdminSession, createAdminResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const sessionCheck = await validateAdminSession();

  return createAdminResponse({
    authenticated: sessionCheck.authenticated,
  });
}
