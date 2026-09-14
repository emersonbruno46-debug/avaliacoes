import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminToken, COOKIE_NAME } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { extractAndValidatePlaceId, buildGoogleReviewUrl } from '@/lib/placeIdHelper';

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  return Boolean(sessionCookie && sessionCookie.value === getAdminToken());
}

/**
 * POST /api/admin/plates
 * Inserção protegida no servidor de 1 placa individual
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado. Faça login primeiro.' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          'Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel! Adicione a chave service_role em Settings -> Environment Variables.',
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { plates } = body;

    if (!Array.isArray(plates) || plates.length === 0) {
      return NextResponse.json({ error: 'Dados de placas inválidos.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('plates')
      .insert(plates)
      .select();

    if (error) {
      console.error('Erro na inserção server-side do Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao criar placas no servidor.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/plates
 * Atualização protegida de nome da empresa e URL de destino
 */
export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado. Faça login primeiro.' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error:
          'Falta configurar as chaves do Supabase! Adicione SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.',
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { id, business_name, google_place_id, link_tested } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID da placa é obrigatório.' }, { status: 400 });
    }

    if (!business_name || !String(business_name).trim()) {
      return NextResponse.json({ error: 'Nome do estabelecimento é obrigatório.' }, { status: 400 });
    }

    // Validação estrita do Google Place ID no servidor
    const validation = extractAndValidatePlaceId(String(google_place_id || ''));
    if (!validation.isValid || !validation.placeId) {
      return NextResponse.json(
        { error: validation.error || 'Google Place ID inválido.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Confirmar que a placa existe antes de alterar
    const { data: existingPlate, error: fetchErr } = await supabaseAdmin
      .from('plates')
      .select('id, code, status, destination_url, business_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existingPlate) {
      return NextResponse.json({ error: 'Placa não encontrada no banco de dados.' }, { status: 404 });
    }

    // 2. Gerar a URL oficial de destino no servidor (não confiar em URL enviada pelo cliente)
    const destination_url = buildGoogleReviewUrl(validation.placeId);

    // 3. Montar payload com horários do servidor
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      business_name: String(business_name).trim(),
      company_name: String(business_name).trim(), // Sincronização retrocompatível
      google_place_id: validation.placeId,
      destination_url,
      status: 'active', // 'active' é o valor padrão verificado pela rota /p/[code]
      linked_at: nowIso,
      link_verified_at: Boolean(link_tested) ? nowIso : null,
      updated_at: nowIso,
    };

    // 4. Atualizar somente a placa selecionada (preservando rigorosamente o code original)
    const { data, error } = await supabaseAdmin
      .from('plates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro no Supabase ao atualizar placa:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao atualizar placa.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/plates
 * Exclusão protegida de placa do banco de dados
 */
export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Não autorizado. Faça login primeiro.' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          'Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel! Adicione a chave service_role em Settings -> Environment Variables.',
      },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID da placa é obrigatório.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('plates').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao deletar placa.' },
      { status: 500 }
    );
  }
}
