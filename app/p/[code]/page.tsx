import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, QrCode } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function PlateRedirectPage({ params }: PageProps) {
  const { code } = await params;

  if (!code) {
    return <PlateNotFoundView code="" />;
  }

  const cleanCode = code.trim().toUpperCase();

  try {
    const { data: plate, error } = await supabase
      .from('plates')
      .select('destination_url, status, company_name')
      .eq('code', cleanCode)
      .maybeSingle();

    if (error) {
      console.error('Erro ao consultar código da placa no Supabase:', error);
      return <PlateNotFoundView code={cleanCode} />;
    }

    if (!plate) {
      return <PlateNotFoundView code={cleanCode} />;
    }

    // Se a placa estiver ativa e possuir URL de destino, redirecionar 307 imediatamente
    if (plate.status === 'active' && plate.destination_url) {
      redirect(plate.destination_url);
    }

    // Se a placa existe mas ainda está como 'available' ou sem destino
    return <PlateNotActivatedView code={cleanCode} />;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as any).digest === 'string' &&
      (err as any).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err;
    }
    console.error('Exceção ao redirecionar placa:', err);
  }

  return <PlateNotFoundView code={cleanCode} />;
}

/**
 * Visualização exibida quando a placa existe mas ainda não foi ativada pelo lojista
 */
function PlateNotActivatedView({ code }: { code: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-amber-100">
          <QrCode className="w-7 h-7" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">
            Esta placa ainda não foi ativada.
          </h1>
          <p className="text-sm text-gray-500">
            Se você é o proprietário desta placa, acesse o painel administrativo para vinculá-la ao seu link de avaliação do Google.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 inline-block">
          <span className="text-xs text-gray-400 font-semibold block uppercase">Código da placa:</span>
          <span className="font-mono text-lg font-black text-gray-800 tracking-wider">
            {code}
          </span>
        </div>

        <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
          Sistema de Placas de Avaliação Google
        </div>
      </div>
    </div>
  );
}

/**
 * Visualização exibida quando o código da placa não existe no banco
 */
function PlateNotFoundView({ code }: { code: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-red-100">
          <AlertCircle className="w-7 h-7" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">
            Placa não encontrada.
          </h1>
          <p className="text-sm text-gray-500">
            O código informado não pertence a nenhuma placa física cadastrada.
          </p>
        </div>

        {code && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 inline-block">
            <span className="font-mono text-sm font-semibold text-gray-600">
              {code}
            </span>
          </div>
        )}

        <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
          Verifique se a URL foi digitada corretamente.
        </div>
      </div>
    </div>
  );
}
