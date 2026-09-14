import {
  validateAdminSession,
  validateRequestOrigin,
  validateJsonContentType,
  createAdminResponse,
} from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { generateBatchPlateRecords } from '@/lib/codeGenerator';

const ALLOWED_QUANTITIES = [10, 20, 50, 100];

/**
 * POST /api/admin/plates/batch
 * Geração em lote protegida e executada 100% no servidor
 */
export async function POST(request: Request) {
  // 1. Validação de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { success: false, error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Validação de Sessão Administrativa Centralizada
  const sessionCheck = await validateAdminSession();
  if (!sessionCheck.authenticated) {
    return createAdminResponse(
      { success: false, error: 'Sessão expirada ou não autorizada. Faça login novamente.' },
      { status: 401 }
    );
  }

  // 3. Validação de Content-Type
  if (!validateJsonContentType(request)) {
    return createAdminResponse(
      { success: false, error: 'Content-Type deve ser application/json.' },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return createAdminResponse(
      { success: false, error: 'Corpo JSON malformado.' },
      { status: 400 }
    );
  }

  const quantity = Number(body?.quantity);

  if (!ALLOWED_QUANTITIES.includes(quantity)) {
    return createAdminResponse(
      {
        success: false,
        error: 'Quantidade inválida. Escolha entre 10, 20, 50 ou 100 placas.',
      },
      { status: 400 }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Gerar os códigos únicos sem colisões no servidor
    const batchPayload = await generateBatchPlateRecords(quantity, supabaseAdmin);

    // 2. Inserção em lote no Supabase através da chave administrativa server-side
    const { data, error } = await supabaseAdmin
      .from('plates')
      .insert(batchPayload)
      .select();

    if (error) {
      console.error('[BATCH PLATES ERROR] Erro ao inserir lote no Supabase:', error.message);
      return createAdminResponse(
        { success: false, error: 'Erro ao cadastrar lote de placas no banco de dados.' },
        { status: 500 }
      );
    }

    return createAdminResponse({
      success: true,
      count: data?.length || 0,
      data,
    });
  } catch (err: any) {
    console.error('[BATCH PLATES EXCEPTION] Falha inesperada ao processar o lote:', err?.message || err);
    return createAdminResponse(
      {
        success: false,
        error: 'Falha inesperada ao processar lote no servidor.',
      },
      { status: 500 }
    );
  }
}
