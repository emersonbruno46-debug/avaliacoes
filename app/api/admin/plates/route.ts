import {
  validateAdminSession,
  validateRequestOrigin,
  validateJsonContentType,
  createAdminResponse,
} from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { extractAndValidatePlaceId, buildGoogleReviewUrl } from '@/lib/placeIdHelper';

/**
 * POST /api/admin/plates
 * Inserção protegida no servidor de placas
 */
export async function POST(request: Request) {
  // 1. Validação de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Validação de Sessão Administrativa Centralizada
  const sessionCheck = await validateAdminSession();
  if (!sessionCheck.authenticated) {
    return createAdminResponse(
      { error: 'Não autorizado. Faça login primeiro.' },
      { status: 401 }
    );
  }

  // 3. Validação de Content-Type
  if (!validateJsonContentType(request)) {
    return createAdminResponse(
      { error: 'Content-Type deve ser application/json.' },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return createAdminResponse({ error: 'Corpo JSON malformado.' }, { status: 400 });
  }

  const { plates } = body || {};

  if (!Array.isArray(plates) || plates.length === 0) {
    return createAdminResponse({ error: 'Dados de placas inválidos.' }, { status: 400 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('plates')
      .insert(plates)
      .select();

    if (error) {
      console.error('[PLATES POST ERROR] Erro na inserção no Supabase:', error.message);
      return createAdminResponse(
        { error: 'Erro ao cadastrar placas no banco de dados.' },
        { status: 500 }
      );
    }

    return createAdminResponse({ success: true, data });
  } catch (err: any) {
    console.error('[PLATES POST EXCEPTION]', err?.message || err);
    return createAdminResponse(
      { error: 'Falha interna ao processar inserção de placas.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/plates
 * Atualização protegida de estabelecimento e Place ID da placa
 */
export async function PUT(request: Request) {
  // 1. Validação de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Validação de Sessão Administrativa Centralizada
  const sessionCheck = await validateAdminSession();
  if (!sessionCheck.authenticated) {
    return createAdminResponse(
      { error: 'Não autorizado. Faça login primeiro.' },
      { status: 401 }
    );
  }

  // 3. Validação de Content-Type
  if (!validateJsonContentType(request)) {
    return createAdminResponse(
      { error: 'Content-Type deve ser application/json.' },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return createAdminResponse({ error: 'Corpo JSON malformado.' }, { status: 400 });
  }

  const { id, business_name, google_place_id, link_tested, action } = body || {};

  if (!id) {
    return createAdminResponse({ error: 'ID da placa é obrigatório.' }, { status: 400 });
  }

  // Ação de desvincular a placa (retornar ao estoque disponível)
  if (action === 'unlink') {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const nowIso = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('plates')
        .update({
          business_name: null,
          company_name: null,
          google_place_id: null,
          destination_url: null,
          formatted_address: null,
          status: 'available',
          linked_at: null,
          link_verified_at: null,
          updated_at: nowIso,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[PLATES UNLINK ERROR] Erro ao desvincular placa:', error.message);
        return createAdminResponse(
          { error: 'Erro ao desvincular placa no banco de dados.' },
          { status: 500 }
        );
      }

      return createAdminResponse({ success: true, data });
    } catch (err: any) {
      console.error('[PLATES UNLINK EXCEPTION]', err?.message || err);
      return createAdminResponse(
        { error: 'Falha interna ao desvincular placa.' },
        { status: 500 }
      );
    }
  }

  if (!business_name || !String(business_name).trim()) {
    return createAdminResponse({ error: 'Nome do estabelecimento é obrigatório.' }, { status: 400 });
  }

  // Validação estrita do Google Place ID no servidor
  const validation = extractAndValidatePlaceId(String(google_place_id || ''));
  if (!validation.isValid || !validation.placeId) {
    return createAdminResponse(
      { error: validation.error || 'Google Place ID inválido.' },
      { status: 400 }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Confirmar que a placa existe antes de alterar
    const { data: existingPlate, error: fetchErr } = await supabaseAdmin
      .from('plates')
      .select('id, code, status, destination_url, business_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existingPlate) {
      return createAdminResponse({ error: 'Placa não encontrada no banco de dados.' }, { status: 404 });
    }

    // 2. Gerar a URL oficial de destino no servidor (não confiar em URL enviada pelo cliente)
    const destination_url = buildGoogleReviewUrl(validation.placeId);

    // 3. Montar payload com horários do servidor e preservar integridade do code
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      business_name: String(business_name).trim(),
      company_name: String(business_name).trim(), // Sincronização retrocompatível
      google_place_id: validation.placeId,
      destination_url,
      status: 'active',
      linked_at: nowIso,
      link_verified_at: Boolean(link_tested) ? nowIso : null,
      updated_at: nowIso,
    };

    // 4. Atualizar somente a placa selecionada
    const { data, error } = await supabaseAdmin
      .from('plates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PLATES PUT ERROR] Erro no Supabase ao atualizar placa:', error.message);
      return createAdminResponse(
        { error: 'Erro ao atualizar dados da placa no banco de dados.' },
        { status: 500 }
      );
    }

    return createAdminResponse({ success: true, data });
  } catch (err: any) {
    console.error('[PLATES PUT EXCEPTION]', err?.message || err);
    return createAdminResponse(
      { error: 'Falha interna ao atualizar dados da placa.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/plates
 * Exclusão protegida de placa do banco de dados
 */
export async function DELETE(request: Request) {
  // 1. Validação de Origin contra CSRF
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.isValid) {
    return createAdminResponse(
      { error: originCheck.error || 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  // 2. Validação de Sessão Administrativa Centralizada
  const sessionCheck = await validateAdminSession();
  if (!sessionCheck.authenticated) {
    return createAdminResponse(
      { error: 'Não autorizado. Faça login primeiro.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return createAdminResponse({ error: 'ID da placa é obrigatório.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('plates').delete().eq('id', id);

    if (error) {
      console.error('[PLATES DELETE ERROR] Erro ao deletar placa:', error.message);
      return createAdminResponse(
        { error: 'Erro ao excluir placa do banco de dados.' },
        { status: 500 }
      );
    }

    return createAdminResponse({ success: true });
  } catch (err: any) {
    console.error('[PLATES DELETE EXCEPTION]', err?.message || err);
    return createAdminResponse(
      { error: 'Falha interna ao excluir placa.' },
      { status: 500 }
    );
  }
}
