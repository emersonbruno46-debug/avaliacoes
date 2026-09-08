import crypto from 'crypto';

const COOKIE_NAME = 'admin_session';

/**
 * Retorna o hash do token de sessão baseado na ADMIN_PASSWORD do ambiente.
 */
export function getAdminToken(): string {
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  return crypto.createHash('sha256').update(`salt_qr_code_${password}`).digest('hex');
}

/**
 * Valida a senha fornecida pelo usuário.
 */
export function validateAdminPassword(inputPassword: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD || 'admin123';
  return inputPassword.trim() === configuredPassword.trim();
}

export { COOKIE_NAME };
