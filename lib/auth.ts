import 'server-only';
import crypto from 'crypto';
import net from 'net';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from './supabaseAdmin';

export const COOKIE_NAME = 'admin_session';
export const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12 horas de validade absoluta
export const MAX_PASSWORD_LENGTH = 512;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MINUTES = 15;

/**
 * Validação rigorosa e segura da senha administrativa.
 * - Rejeita senhas ausentes, vazias ou com mais de 512 caracteres.
 * - NÃO aplica .trim(): compara exatamente os bytes digitados.
 * - Se ADMIN_PASSWORD não estiver configurada no servidor, recusa com erro 503 genérico e log interno.
 * - Utiliza crypto.timingSafeEqual sobre hashes SHA-256 para evitar qualquer timing attack.
 */
export function validateAdminPassword(inputPassword: unknown): {
  isValid: boolean;
  status: number;
  error?: string;
} {
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredPassword || configuredPassword.length === 0) {
    console.error('[AUTH CRITICAL] A variável de ambiente ADMIN_PASSWORD não está configurada ou está vazia.');
    return {
      isValid: false,
      status: 503,
      error: 'Serviço de autenticação temporariamente indisponível. Contate o administrador.',
    };
  }

  if (typeof inputPassword !== 'string' || inputPassword.length === 0 || inputPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      status: 401,
      error: 'Senha incorreta.',
    };
  }

  // Hashes SHA-256 de tamanho fixo (32 bytes) comparados em tempo constante
  const inputHash = crypto.createHash('sha256').update(inputPassword, 'utf8').digest();
  const targetHash = crypto.createHash('sha256').update(configuredPassword, 'utf8').digest();

  const isMatch = crypto.timingSafeEqual(inputHash, targetHash);

  if (!isMatch) {
    return {
      isValid: false,
      status: 401,
      error: 'Senha incorreta.',
    };
  }

  return { isValid: true, status: 200 };
}

/**
 * Cria uma nova sessão administrativa revogável no Supabase.
 * - Gera token criptograficamente aleatório de 32 bytes (64 caracteres hex).
 * - Armazena apenas o hash SHA-256 do token na tabela admin_sessions.
 * - Prazo de expiração absoluto de 12 horas.
 */
export async function createAdminSession(): Promise<{
  token: string;
  expiresAt: Date;
  maxAge: number;
}> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('admin_sessions').insert({
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[AUTH ERROR] Erro ao gravar sessão administrativa no Supabase:', error.message);
    throw new Error('Falha ao persistir sessão administrativa.');
  }

  return {
    token: rawToken,
    expiresAt,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

/**
 * Helper centralizado para validação server-side da sessão administrativa.
 * - Exige token com exatamente 64 caracteres hexadecimais (/^[0-9a-fA-F]{64}$/).
 * - Valida Number.isFinite(expiresAt) antes de comparar expiração.
 * - Verifica se a sessão existe, se não foi revogada e se não expirou no banco.
 * - Rejeita imediatamente tokens antigos determinísticos do MVP e tokens falsificados.
 */
export async function validateAdminSession(explicitToken?: string | null): Promise<{
  authenticated: boolean;
  reason?: 'missing' | 'invalid' | 'expired' | 'revoked';
}> {
  try {
    let token = explicitToken;

    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    }

    // Exigência estrita de token hexadecimal com exatamente 64 caracteres
    if (!token || typeof token !== 'string' || !/^[0-9a-fA-F]{64}$/.test(token)) {
      return { authenticated: false, reason: 'missing' };
    }

    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const supabaseAdmin = getSupabaseAdmin();

    const { data: session, error } = await supabaseAdmin
      .from('admin_sessions')
      .select('id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error || !session) {
      return { authenticated: false, reason: 'invalid' };
    }

    if (session.revoked_at) {
      return { authenticated: false, reason: 'revoked' };
    }

    const expiresAt = new Date(session.expires_at).getTime();

    // Validação estrita de número finito antes de comparar timestamp
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { authenticated: false, reason: 'expired' };
    }

    return { authenticated: true };
  } catch (err: any) {
    console.error('[AUTH ERROR] Falha inesperada ao validar sessão:', err?.message || err);
    return { authenticated: false, reason: 'invalid' };
  }
}

/**
 * Revoga uma sessão administrativa no Supabase marcando revoked_at.
 * Deve ser executado antes de apagar o cookie no logout.
 */
export async function revokeAdminSession(explicitToken?: string | null): Promise<boolean> {
  try {
    let token = explicitToken;

    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    }

    if (!token || typeof token !== 'string' || !/^[0-9a-fA-F]{64}$/.test(token)) {
      return true; // Nada a revogar
    }

    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);

    if (error) {
      console.error('[AUTH ERROR] Erro ao revogar sessão no Supabase:', error.message);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[AUTH ERROR] Falha inesperada ao revogar sessão:', err?.message || err);
    return false;
  }
}

/**
 * Extração de IP estritamente conforme a documentação oficial da Vercel:
 * https://vercel.com/docs/headers/request-headers
 *
 * Em produção na Vercel:
 * - Utiliza exclusivamente o cabeçalho confiável 'x-real-ip', que é sobrescrito
 *   pela borda da Vercel no momento da conexão TCP/TLS do cliente.
 * - Se não houver IP válido, retorna NULL (não atribui 'unknown-ip' genérico).
 *
 * Em ambiente de desenvolvimento local (process.env.NODE_ENV !== 'production'):
 * - Utiliza 'x-real-ip', 'x-forwarded-for' local ou fallback para '127.0.0.1'.
 */
export function extractClientIp(request: Request): string | null {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const vercelRealIp = request.headers.get('x-real-ip')?.trim();
    if (vercelRealIp && net.isIP(vercelRealIp) !== 0) {
      return vercelRealIp;
    }
    return null;
  }

  // Ambiente de desenvolvimento local:
  const localRealIp = request.headers.get('x-real-ip')?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const candidate = localRealIp || forwardedFor || '127.0.0.1';

  if (candidate && net.isIP(candidate) !== 0) {
    return candidate;
  }

  return '127.0.0.1';
}

/**
 * Checagem e registro ATÔMICO de rate limiting no Supabase.
 * Regra: Registra até 5 tentativas de login por IP em 15 minutos.
 *
 * Executa EXCLUSIVAMENTE a Stored Procedure PostgreSQL `check_and_record_login_attempt` via RPC.
 * SEM FALLBACK para memória local ou chamadas SELECT/INSERT separadas.
 * Se a RPC falhar, lança erro para que a rota responda status 503 sem emitir sessão.
 */
export async function checkAndRecordLoginAttempt(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
}> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.rpc('check_and_record_login_attempt', {
    p_ip: ip,
    p_max_attempts: MAX_FAILED_LOGIN_ATTEMPTS,
    p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
  });

  if (error) {
    console.error('[RATE LIMIT CRITICAL] Erro na execução da Stored Procedure RPC atômica:', error.message);
    throw new Error('Falha no armazenamento atômico de rate limit.');
  }

  return {
    allowed: Boolean(data?.allowed),
    retryAfterSeconds: Number(data?.retry_after_seconds || 0),
  };
}

/**
 * Limpa tentativas do IP após login bem-sucedido (se aplicável).
 */
export async function clearLoginAttemptsForIp(ip: string): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from('admin_login_attempts').delete().eq('ip_address', ip);
  } catch (err: any) {
    console.error('[RATE LIMIT ERROR] Falha ao limpar tentativas após sucesso:', err?.message || err);
  }
}

/**
 * Validação de Origin para proteção contra CSRF em requisições mutantes (POST, PUT, DELETE).
 * - Aceita apenas NEXT_PUBLIC_APP_URL e ALLOWED_ORIGINS configurados.
 * - Em desenvolvimento (NODE_ENV !== 'production'), aceita localhost e 127.0.0.1.
 * - Em produção, NÃO aceita subdomínios arbitrários *.vercel.app.
 */
export function validateRequestOrigin(request: Request): {
  isValid: boolean;
  error?: string;
} {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  let originToTest = originHeader;

  if (!originToTest && refererHeader) {
    try {
      const parsed = new URL(refererHeader);
      originToTest = parsed.origin;
    } catch {
      originToTest = null;
    }
  }

  if (!originToTest) {
    return { isValid: false, error: 'Origem da requisição não informada.' };
  }

  const allowedOrigins: string[] = [];

  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowedOrigins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {}
  }

  if (process.env.ALLOWED_ORIGINS) {
    const extra = process.env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    for (const item of extra) {
      try {
        allowedOrigins.push(new URL(item).origin);
      } catch {}
    }
  }

  // Em desenvolvimento, aceitar localhost e 127.0.0.1 em qualquer porta
  if (process.env.NODE_ENV !== 'production') {
    if (
      originToTest.startsWith('http://localhost:') ||
      originToTest === 'http://localhost' ||
      originToTest.startsWith('http://127.0.0.1:') ||
      originToTest === 'http://127.0.0.1'
    ) {
      return { isValid: true };
    }
  }

  const isAllowed = allowedOrigins.includes(originToTest);

  if (!isAllowed) {
    return {
      isValid: false,
      error: 'Origem da requisição não autorizada.',
    };
  }

  return { isValid: true };
}

/**
 * Valida se o Content-Type é application/json.
 */
export function validateJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  return Boolean(contentType && contentType.toLowerCase().includes('application/json'));
}

/**
 * Cria resposta administrativa padronizada garantindo Cache-Control: no-store
 * para que navegadores e proxies intermediários nunca armazenem dados sensíveis em cache.
 */
export function createAdminResponse(data: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}
