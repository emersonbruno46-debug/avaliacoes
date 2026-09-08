import { supabase, isSupabaseConfigured } from './supabase';

const ALLOWED_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

/**
 * Gera uma string aleatória de 5 caracteres usando apenas os caracteres permitidos.
 */
export function generateRandomCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
    result += ALLOWED_CHARS[randomIndex];
  }
  return result;
}

/**
 * Gera um código único e verifica se ele já existe no Supabase.
 * Se já existir, gera outro automaticamente até encontrar um inédito.
 */
export async function generateUniquePlateCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const candidateCode = generateRandomCode();

    if (!isSupabaseConfigured()) {
      return candidateCode;
    }

    const { data, error } = await supabase
      .from('plates')
      .select('code')
      .eq('code', candidateCode)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao verificar unicidade do código no Supabase:', error);
      return candidateCode;
    }

    if (!data) {
      return candidateCode;
    }

    attempts++;
  }

  // Fallback seguro caso atinja limite de tentativas
  return generateRandomCode() + Math.floor(Math.random() * 9 + 1);
}
