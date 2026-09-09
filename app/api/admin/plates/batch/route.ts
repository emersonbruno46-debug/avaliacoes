import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminToken, COOKIE_NAME } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { generateBatchPlateRecords } from '@/lib/codeGenerator';

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  return Boolean(sessionCookie && sessionCookie.value === getAdminToken());
}

const ALLOWED_QUANTITIES = [10, 20, 50, 100];

/**
 * POST /api/admin/plates/batch
 * Geração em lote protegida e executada 100% no servidor
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { success: false, error: 'Sessão expirada. Faça login novamente.' },
      { status: 401 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Falta configurar SUPABASE_SERVICE_ROLE_KEY na Vercel! Adicione a chave service_role em Settings -> Environment Variables.',
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const quantity = Number(body.quantity);

    if (!ALLOWED_QUANTITIES.includes(quantity)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Quantidade inválida. Escolha entre 10, 20, 50 ou 100 placas.',
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Gerar os códigos únicos sem colisões no servidor
    const batchPayload = await generateBatchPlateRecords(quantity, supabaseAdmin);

    // 2. Inserção em lote única no Supabase através da chave administrativa server-side
    const { data, error } = await supabaseAdmin
      .from('plates')
      .insert(batchPayload)
      .select();

    if (error) {
      console.error('Erro ao inserir lote no Supabase:', error);
      return NextResponse.json(
        { success: false, error: `Erro no Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      data,
    });
  } catch (err: any) {
    console.error('Exceção na geração em lote:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Falha inesperada ao processar o lote no servidor.',
      },
      { status: 500 }
    );
  }
}
