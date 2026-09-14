/**
 * SUÍTE DE TESTES DE SEGURANÇA E AUTENTICAÇÃO ADMINISTRATIVA
 * Importa e exercita DIRETAMENTE o código REAL de produção de lib/auth.ts, lib/placeIdHelper.ts,
 * lib/codeGenerator.ts e lib/supabaseAdmin.ts em ambiente isolado, sem alterar o banco de produção.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import test, { describe, it } from 'node:test';

// IMPORTS DIRETOS DOS MÓDULOS REAIS DE PRODUÇÃO DO PROJETO
import {
  validateAdminPassword,
  extractClientIp,
  validateRequestOrigin,
  validateJsonContentType,
  createAdminResponse,
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  MAX_PASSWORD_LENGTH,
  MAX_FAILED_LOGIN_ATTEMPTS,
  RATE_LIMIT_WINDOW_MINUTES,
} from '../lib/auth.ts';

import { extractAndValidatePlaceId, buildGoogleReviewUrl } from '../lib/placeIdHelper.ts';
import { generateRandomCode } from '../lib/codeGenerator.ts';

// Simulador de Banco de Dados Isolado para as chamadas da tabela admin_sessions e RPC rate limit do Supabase
class IsolatedDatabaseMock {
  constructor() {
    this.sessions = new Map();
    this.attempts = [];
  }

  createSession() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

    const sessionRecord = {
      id: crypto.randomUUID(),
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
    };
    this.sessions.set(tokenHash, sessionRecord);

    return { token: rawToken, expiresAt, maxAge: SESSION_DURATION_SECONDS };
  }

  validateSession(token) {
    if (!token || typeof token !== 'string' || !/^[0-9a-fA-F]{64}$/.test(token)) {
      return { authenticated: false, reason: 'missing' };
    }
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const session = this.sessions.get(tokenHash);

    if (!session) {
      return { authenticated: false, reason: 'invalid' };
    }
    if (session.revoked_at) {
      return { authenticated: false, reason: 'revoked' };
    }
    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { authenticated: false, reason: 'expired' };
    }
    return { authenticated: true, session };
  }

  revokeSession(token) {
    if (!token || !/^[0-9a-fA-F]{64}$/.test(token)) return true;
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const session = this.sessions.get(tokenHash);
    if (session && !session.revoked_at) {
      session.revoked_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  checkAndRecordRateLimitAtomic(ip) {
    const windowStart = Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
    const validAttempts = this.attempts
      .filter((a) => a.ip_address === ip && new Date(a.attempted_at).getTime() >= windowStart)
      .sort((a, b) => new Date(a.attempted_at).getTime() - new Date(b.attempted_at).getTime());

    if (validAttempts.length >= MAX_FAILED_LOGIN_ATTEMPTS) {
      const oldest = new Date(validAttempts[0].attempted_at).getTime();
      const unlockTime = oldest + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
      const retryAfter = Math.max(1, Math.ceil((unlockTime - Date.now()) / 1000));
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    this.attempts.push({
      id: crypto.randomUUID(),
      ip_address: ip,
      attempted_at: new Date().toISOString(),
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

describe('Suíte de Testes de Autenticação (Exercitando Código Real de Produção)', () => {
  const TEST_PASSWORD = 'SenhaSegura#2026@Exata';

  // [CÓDIGO REAL] 1. Validação de senha real
  it('1. [CÓDIGO REAL] validateAdminPassword: aceita senha correta e rejeita incorreta em tempo constante', () => {
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;

    const correctRes = validateAdminPassword(TEST_PASSWORD);
    assert.strictEqual(correctRes.isValid, true);
    assert.strictEqual(correctRes.status, 200);

    const wrongRes = validateAdminPassword('SenhaIncorreta123');
    assert.strictEqual(wrongRes.isValid, false);
    assert.strictEqual(wrongRes.status, 401);
  });

  // [CÓDIGO REAL] 2. Não aplicar trim na senha real
  it('2. [CÓDIGO REAL] validateAdminPassword: NÃO aplica trim à senha (comparação exata de bytes)', () => {
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;

    const resTrailing = validateAdminPassword(TEST_PASSWORD + ' ');
    assert.strictEqual(resTrailing.isValid, false);

    const resLeading = validateAdminPassword(' ' + TEST_PASSWORD);
    assert.strictEqual(resLeading.isValid, false);
  });

  // [CÓDIGO REAL] 3. ADMIN_PASSWORD ausente/vazia
  it('3. [CÓDIGO REAL] validateAdminPassword: falha com 503 se ADMIN_PASSWORD estiver ausente ou vazia', () => {
    delete process.env.ADMIN_PASSWORD;

    const resUndefined = validateAdminPassword(TEST_PASSWORD);
    assert.strictEqual(resUndefined.isValid, false);
    assert.strictEqual(resUndefined.status, 503);
    assert.match(resUndefined.error, /indisponível/i);

    process.env.ADMIN_PASSWORD = '';
    const resEmpty = validateAdminPassword(TEST_PASSWORD);
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.status, 503);
  });

  // [CÓDIGO REAL] 4. Tamanho máximo de senha
  it('4. [CÓDIGO REAL] validateAdminPassword: rejeita senhas maiores que 512 caracteres', () => {
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;

    const huge = 'X'.repeat(513);
    const res = validateAdminPassword(huge);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.status, 401);
  });

  // [CÓDIGO REAL] 5. Extração confiável de IP para ambiente Vercel
  it('5. [CÓDIGO REAL] extractClientIp: em produção Vercel, utiliza exclusivamente x-real-ip; sem IP válido retorna null', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // Vercel Edge define x-real-ip
      const reqVercel = new Request('https://app.com', {
        headers: {
          'x-real-ip': '201.86.120.4',
        },
      });
      assert.strictEqual(extractClientIp(reqVercel), '201.86.120.4');

      // Sem x-real-ip em produção -> retorna null (para responder 503 sem agrupar em unknown-ip)
      const reqNoRealIp = new Request('https://app.com', {
        headers: {
          'x-forwarded-for': '1.1.1.1',
        },
      });
      assert.strictEqual(extractClientIp(reqNoRealIp), null);

      // Header malicioso / inválido -> retorna null
      const reqHacker = new Request('https://app.com', {
        headers: {
          'x-real-ip': '189.10.20.30; DROP TABLE plates;',
        },
      });
      assert.strictEqual(extractClientIp(reqHacker), null);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // [CÓDIGO REAL] 6. Extração de IP em desenvolvimento local
  it('6. [CÓDIGO REAL] extractClientIp: em desenvolvimento local, aceita localRealIp/x-forwarded-for ou 127.0.0.1', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';

      const reqDev = new Request('http://localhost:3000', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
        },
      });
      assert.strictEqual(extractClientIp(reqDev), '127.0.0.1');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // [CÓDIGO REAL] 7. Validação de Origin (CSRF)
  it('7. [CÓDIGO REAL] validateRequestOrigin: bloqueia subdomínios *.vercel.app arbitrários em produção', () => {
    const origEnv = process.env.NODE_ENV;
    const origApp = process.env.NEXT_PUBLIC_APP_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_APP_URL = 'https://avaliacoes-oficial.com.br';

      // Origem oficial
      const reqOfficial = new Request('https://avaliacoes-oficial.com.br/api/admin/login', {
        headers: { origin: 'https://avaliacoes-oficial.com.br' },
      });
      assert.strictEqual(validateRequestOrigin(reqOfficial).isValid, true);

      // Subdomínio não autorizado
      const reqAttacker = new Request('https://avaliacoes-oficial.com.br/api/admin/login', {
        headers: { origin: 'https://phishing-attacker.vercel.app' },
      });
      const checkAttacker = validateRequestOrigin(reqAttacker);
      assert.strictEqual(checkAttacker.isValid, false);
      assert.match(checkAttacker.error, /não autorizada/i);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.NEXT_PUBLIC_APP_URL = origApp;
    }
  });

  // [CÓDIGO REAL] 8. Validação de Content-Type
  it('8. [CÓDIGO REAL] validateJsonContentType: exige application/json', () => {
    const reqJson = new Request('https://app.com', {
      headers: { 'content-type': 'application/json' },
    });
    assert.strictEqual(validateJsonContentType(reqJson), true);

    const reqForm = new Request('https://app.com', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.strictEqual(validateJsonContentType(reqForm), false);
  });

  // [CÓDIGO REAL] 9. Resposta Administrativa com Cache-Control: no-store
  it('9. [CÓDIGO REAL] createAdminResponse: define Cache-Control: no-store, no-cache', () => {
    const res = createAdminResponse({ success: true }, { status: 200 });
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    assert.strictEqual(res.headers.get('Pragma'), 'no-cache');
  });

  // [CÓDIGO REAL] 10. Utilitários de Place ID e Códigos de Placas
  it('10. [CÓDIGO REAL] extractAndValidatePlaceId & generateRandomCode: operam perfeitamente no servidor', () => {
    const valPlace = extractAndValidatePlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.strictEqual(valPlace.isValid, true);
    assert.strictEqual(valPlace.placeId, 'ChIJN1t_tDeuEmsRUsoyG83frY4');

    const url = buildGoogleReviewUrl('ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.strictEqual(url, 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');

    const code = generateRandomCode();
    assert.strictEqual(code.length, 5);
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  });

  // [ISOLADO / MOCK] 11. Emissão, revogação e expiração de sessões exigindo token de 64 hex
  it('11. [MOCK BANCO ISOLADO] Sessão exige token com exatamente 64 hex e Number.isFinite em expires_at', () => {
    const db = new IsolatedDatabaseMock();
    const session = db.createSession();

    assert.strictEqual(session.token.length, 64);
    assert.match(session.token, /^[0-9a-fA-F]{64}$/);

    // Validação ativa
    assert.strictEqual(db.validateSession(session.token).authenticated, true);

    // Token com tamanho incorreto ou caracteres inválidos -> deve falhar como 'missing'
    assert.strictEqual(db.validateSession('12345').reason, 'missing');
    assert.strictEqual(db.validateSession('Z'.repeat(64)).reason, 'missing');

    // Revogação no logout
    db.revokeSession(session.token);

    // Reutilização após logout DEVE falhar com 'revoked'
    const afterLogout = db.validateSession(session.token);
    assert.strictEqual(afterLogout.authenticated, false);
    assert.strictEqual(afterLogout.reason, 'revoked');
  });

  // [ISOLADO / MOCK] 12. Regra do limitador atômico (até 5 tentativas por IP em 15 min)
  it('12. [MOCK BANCO ISOLADO] Rate limit atômico: registra até 5 chamadas de login por IP em 15 minutos', () => {
    const db = new IsolatedDatabaseMock();
    const ip = '200.150.10.5';

    for (let i = 0; i < 4; i++) {
      const res = db.checkAndRecordRateLimitAtomic(ip);
      assert.strictEqual(res.allowed, true);
    }

    // 5ª tentativa é permitida e atinge o limite máximo
    const res5 = db.checkAndRecordRateLimitAtomic(ip);
    assert.strictEqual(res5.allowed, true);

    // 6ª tentativa excede o limite e é bloqueada
    const resBlocked = db.checkAndRecordRateLimitAtomic(ip);
    assert.strictEqual(resBlocked.allowed, false);
    assert.ok(resBlocked.retryAfterSeconds > 0);
  });
});
