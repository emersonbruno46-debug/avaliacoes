import { supabase, isSupabaseConfigured } from './supabase';
import { CreatePlateInput } from './types';

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
 * Gera um código único e verifica se ele já existe no Supabase (para chamadas individuais).
 */
export async function generateUniquePlateCode(supabaseClient = supabase): Promise<string> {
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts) {
    const candidateCode = generateRandomCode();

    if (!isSupabaseConfigured()) {
      return candidateCode;
    }

    const { data, error } = await supabaseClient
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

  return generateRandomCode() + Math.floor(Math.random() * 9 + 1);
}

/**
 * Gera um lote de registros de placas garantindo unicidade server-side sem colisão.
 */
export async function generateBatchPlateRecords(
  quantity: number,
  supabaseClient = supabase
): Promise<CreatePlateInput[]> {
  const existingSet = new Set<string>();

  // Buscar códigos já existentes no Supabase se configurado
  if (isSupabaseConfigured()) {
    const { data } = await supabaseClient.from('plates').select('code');
    if (data && Array.isArray(data)) {
      data.forEach((item: { code: string }) => {
        if (item.code) existingSet.add(item.code.toUpperCase());
      });
    }
  }

  const batch: CreatePlateInput[] = [];

  for (let i = 0; i < quantity; i++) {
    let candidate = generateRandomCode();
    let attempts = 0;

    while (existingSet.has(candidate) && attempts < 20) {
      candidate = generateRandomCode();
      attempts++;
    }

    existingSet.add(candidate);

    batch.push({
      code: candidate,
      company_name: null,
      destination_url: null,
      status: 'available',
    });
  }

  return batch;
}
