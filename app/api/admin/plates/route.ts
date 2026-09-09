import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminToken, COOKIE_NAME } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

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

  try {
    const body = await request.json();
    const { id, company_name, destination_url, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID da placa é obrigatório.' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (company_name !== undefined) updatePayload.company_name = company_name;
    if (destination_url !== undefined) updatePayload.destination_url = destination_url;
    if (status !== undefined) updatePayload.status = status;

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('plates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
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
