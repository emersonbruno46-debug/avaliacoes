import { cookies } from 'next/headers';
import {
  revokeAdminSession,
  validateRequestOrigin,
  createAdminResponse,
  COOKIE_NAME,
} from '@/lib/auth';

export async function POST(request: Request) {
  // 1. Validação de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { success: false, error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Revogação explícita no Supabase ANTES de apagar o cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await revokeAdminSession(token);
  }

  // 3. Exclusão do cookie no navegador
  cookieStore.delete(COOKIE_NAME);

  return createAdminResponse({ success: true });
}
