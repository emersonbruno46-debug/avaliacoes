import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClientInstance: SupabaseClient | null = null;

/**
 * Verifica se as variáveis necessárias para operações administrativas estão presentes.
 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return Boolean(
    url &&
    key &&
    url !== 'https://placeholder.supabase.co' &&
    key !== 'placeholder-key'
  );
}

/**
 * Retorna o cliente administrativo do Supabase utilizando exclusivamente a SERVICE_ROLE_KEY.
 * NUNCA recorre à chave anônima (sem fallback para anon).
 * Garante que este módulo nunca seja incluído no bundle client-side através de 'server-only'.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[SECURITY ERROR] SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não configurados no servidor. Operações administrativas bloqueadas.'
    );
  }

  if (!adminClientInstance) {
    adminClientInstance = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClientInstance;
}
