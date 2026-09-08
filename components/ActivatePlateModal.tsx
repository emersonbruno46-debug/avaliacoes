'use client';

import { useState, useEffect } from 'react';
import { Plate } from '@/lib/types';
import { X, Store, Globe, Tag, CheckCircle, AlertCircle } from 'lucide-react';

interface ActivatePlateModalProps {
  plate: Plate | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ActivatePlateModal({
  plate,
  onClose,
  onSuccess,
}: ActivatePlateModalProps) {
  const [companyName, setCompanyName] = useState<string>('');
  const [destinationUrl, setDestinationUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (plate) {
      setCompanyName(plate.company_name || '');
      setDestinationUrl(plate.destination_url || '');
      setErrorMsg(null);
    }
  }, [plate]);

  if (!plate) return null;

  const isEditing = plate.status === 'active';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!companyName.trim()) {
      setErrorMsg('Informe o nome da empresa.');
      return;
    }
    if (!destinationUrl.trim()) {
      setErrorMsg('Informe a URL de avaliação do Google.');
      return;
    }

    try {
      new URL(destinationUrl.trim());
    } catch (_) {
      setErrorMsg('Informe uma URL válida (ex: https://search.google.com/...)');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/admin/plates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: plate.id,
          company_name: companyName.trim(),
          destination_url: destinationUrl.trim(),
          status: 'active',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error || 'Erro ao atualizar a placa.');
      }
    } catch (err: any) {
      setErrorMsg(`Erro inesperado: ${err.message || 'Falha na requisição'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <span>{isEditing ? 'EDITAR DESTINO DA PLACA' : 'ATIVAR PLACA FÍSICA'}</span>
          </h2>
          <p className="text-xs text-gray-500">
            Vincule o código da placa à empresa compradora e ao link do Google.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Campo ID da Placa (Automático e Desabilitado) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              ID da Placa (Automático)
            </label>
            <input
              type="text"
              value={plate.code}
              disabled
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-700 font-mono font-bold text-base cursor-not-allowed select-all"
            />
          </div>

          {/* Campo 1: Nome da empresa */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
              <Store className="w-3.5 h-3.5 text-blue-600" />
              Nome da Empresa / Estabelecimento
            </label>
            <input
              type="text"
              placeholder="Ex: Vish Clean"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base"
              required
            />
          </div>

          {/* Campo 2: Link de Avaliação Google */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              Link de Avaliação Google
            </label>
            <input
              type="url"
              placeholder="https://g.page/r/XXXXXXXX/review"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? 'Salvando...'
                : isEditing
                ? 'SALVAR ALTERAÇÕES'
                : 'ATIVAR PLACA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
