import { cookies } from 'next/headers';
import {
  validateAdminPassword,
  createAdminSession,
  extractClientIp,
  checkAndRecordLoginAttempt,
  clearLoginAttemptsForIp,
  validateRequestOrigin,
  validateJsonContentType,
  createAdminResponse,
  COOKIE_NAME,
} from '@/lib/auth';

export async function POST(request: Request) {
  // 1. Proteção de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { success: false, error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Validação do Content-Type
  if (!validateJsonContentType(request)) {
    return createAdminResponse(
      { success: false, error: 'Content-Type deve ser application/json.' },
      { status: 400 }
    );
  }

  // 3. Identificação segura do IP do cliente (conforme documentação da Vercel)
  const clientIp = extractClientIp(request);

  if (!clientIp) {
    return createAdminResponse(
      {
        success: false,
        error: 'Não foi possível determinar o IP de origem confiável da requisição.',
      },
      { status: 503 }
    );
  }

  // 4. Rate limiting persistente e ATÔMICO no Supabase (RPC atômica com pg_advisory_xact_lock)
  // Se a RPC falhar, recusa com 503 sem emitir sessão e sem fallback
  try {
    const rateLimit = await checkAndRecordLoginAttempt(clientIp);
    if (!rateLimit.allowed) {
      const minutes = Math.ceil((rateLimit.retryAfterSeconds || 60) / 60);
      const res = createAdminResponse(
        {
          success: false,
          error: `Muitas tentativas de login por IP. Tente novamente em ${minutes} minuto(s).`,
        },
        { status: 429 }
      );
      if (rateLimit.retryAfterSeconds) {
        res.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
      }
      return res;
    }
  } catch {
    // Fail-closed: se o armazenamento de rate limit falhar, recusa com 503
    return createAdminResponse(
      {
        success: false,
        error: 'Serviço temporariamente indisponível. Tente novamente mais tarde.',
      },
      { status: 503 }
    );
  }

  // 5. Leitura do corpo com proteção contra JSON malformado
  let body: any;
  try {
    body = await request.json();
  } catch {
    return createAdminResponse(
      { success: false, error: 'Corpo da requisição JSON inválido.' },
      { status: 400 }
    );
  }

  const { password } = body || {};

  // 6. Validação de senha segura (sem trim, comparação em tempo constante)
  const validation = validateAdminPassword(password);

  if (!validation.isValid) {
    // Se a senha estiver configurada incorretamente no servidor (503), não emite sessão
    if (validation.status === 503) {
      return createAdminResponse(
        { success: false, error: validation.error },
        { status: 503 }
      );
    }

    return createAdminResponse(
      { success: false, error: validation.error || 'Senha incorreta.' },
      { status: 401 }
    );
  }

  // 7. Emissão de sessão revogável no Supabase
  try {
    const session = await createAdminSession();

    // Limpa histórico de tentativas deste IP após sucesso
    await clearLoginAttemptsForIp(clientIp);

    // Grava cookie com flags de segurança e expiração estrita
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: session.maxAge,
      expires: session.expiresAt,
    });

    return createAdminResponse({ success: true });
  } catch (err: any) {
    console.error('[LOGIN ERROR] Falha ao emitir sessão:', err?.message || err);
    return createAdminResponse(
      { success: false, error: 'Erro interno ao iniciar sessão.' },
      { status: 500 }
    );
  }
}
