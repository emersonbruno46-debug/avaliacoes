'use client';

import { useState, useEffect } from 'react';
import { Plate } from '@/lib/types';
import {
  extractAndValidatePlaceId,
  buildGoogleReviewUrl,
  GOOGLE_REVIEW_PREFIX,
} from '@/lib/placeIdHelper';
import {
  X,
  Store,
  Tag,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  CheckCheck,
  ShieldAlert,
  Search,
  RotateCcw,
} from 'lucide-react';

interface ActivatePlateModalProps {
  plate: Plate | null;
  onClose: () => void;
  onSuccess: (successMessage?: string) => void;
}

export default function ActivatePlateModal({
  plate,
  onClose,
  onSuccess,
}: ActivatePlateModalProps) {
  const [businessName, setBusinessName] = useState<string>('');
  const [placeIdInput, setPlaceIdInput] = useState<string>('');
  const [hasOpenedTest, setHasOpenedTest] = useState<boolean>(false);
  const [isLinkConfirmed, setIsLinkConfirmed] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inicialização ao abrir a placa
  useEffect(() => {
    if (plate) {
      setErrorMsg(null);
      setBusinessName(plate.business_name || plate.company_name || '');
      setPlaceIdInput(plate.google_place_id || '');
      setHasOpenedTest(false);
      setIsLinkConfirmed(false);
      setSaving(false);
    }
  }, [plate]);

  if (!plate) return null;

  const isConfigured = plate.status === 'active' && Boolean(plate.destination_url);
  const currentBusinessDisplay =
    plate.business_name || plate.company_name || 'Estabelecimento não informado';

  // Validação em tempo real do Place ID
  const validation = extractAndValidatePlaceId(placeIdInput);
  const cleanPlaceId = validation.isValid ? validation.placeId : '';
  const previewUrl = cleanPlaceId ? buildGoogleReviewUrl(cleanPlaceId) : '';

  /**
   * Trata a digitação ou colagem no campo Place ID
   * Se o usuário colar um link completo com placeid=, extrai automaticamente apenas o código
   */
  const handlePlaceIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setErrorMsg(null);
    setHasOpenedTest(false);
    setIsLinkConfirmed(false);

    // Se colou uma URL completa contendo placeid=
    if (value.includes('placeid=')) {
      const result = extractAndValidatePlaceId(value);
      if (result.isValid) {
        setPlaceIdInput(result.placeId);
        return;
      }
    }

    setPlaceIdInput(value.trim());
  };

  /**
   * TESTAR LINK EM NOVA ABA
   */
  const handleTestLink = () => {
    if (!validation.isValid || !previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
    setHasOpenedTest(true);
    setIsLinkConfirmed(false);
  };

  /**
   * CONFIRMAR VÍNCULO E SALVAR NO SERVIDOR
   */
  const handleConfirmAndLink = async () => {
    if (!plate) return;

    if (!businessName.trim()) {
      setErrorMsg('Informe o nome do estabelecimento.');
      return;
    }

    if (!validation.isValid || !cleanPlaceId) {
      setErrorMsg(validation.error || 'Informe um Place ID válido.');
      return;
    }

    if (!hasOpenedTest || !isLinkConfirmed) {
      setErrorMsg('Por favor, teste o link e confirme que o estabelecimento está correto antes de salvar.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      // O frontend envia apenas id, business_name, google_place_id e link_tested
      // O servidor é responsável por validar e gerar destination_url, linked_at e link_verified_at
      const payload = {
        id: plate.id,
        business_name: businessName.trim(),
        google_place_id: cleanPlaceId,
        link_tested: true,
      };

      const res = await fetch('/api/admin/plates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onSuccess('Placa vinculada com sucesso ao estabelecimento.');
        onClose();
      } else {
        setErrorMsg(data.error || 'Erro ao vincular estabelecimento à placa.');
      }
    } catch (err: any) {
      setErrorMsg(`Erro de conexão: ${err.message || 'Falha ao salvar no servidor.'}`);
    } finally {
      setSaving(false);
    }
  };

  const isFormReady =
    businessName.trim().length > 0 &&
    validation.isValid &&
    hasOpenedTest &&
    isLinkConfirmed &&
    !saving;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-lg w-full p-5 sm:p-7 space-y-5 relative animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho da Placa */}
        <div className="space-y-1.5 pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-black tracking-wider uppercase">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              <span>Placa selecionada: #{plate.code}</span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide border ${
                isConfigured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {isConfigured ? 'Configurada' : 'Disponível'}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            {isConfigured ? 'Editar Vínculo da Placa' : 'Vincular Estabelecimento'}
          </h2>
          <p className="text-xs text-gray-500">
            O QR Code físico #{plate.code} continuará apontando para a mesma rota; apenas o destino será atualizado.
          </p>
        </div>

        {/* Mensagem de Erro Global */}
        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Alerta caso a placa já esteja configurada */}
        {isConfigured && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-black text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Atenção: Substituição de Destino Existente</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Esta placa já está vinculada ao estabelecimento <strong>{currentBusinessDisplay}</strong>. Ao confirmar, o QR Code passará a redirecionar para a nova empresa:
            </p>
            {plate.destination_url && (
              <div className="bg-white/80 p-2 rounded-lg border border-amber-200 font-mono text-[11px] text-gray-600 truncate">
                Destino atual: {plate.destination_url}
              </div>
            )}
          </div>
        )}

        {/* Formulário Principal */}
        <div className="space-y-4">
          {/* Campo 1: Nome do Estabelecimento */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
              <Store className="w-3.5 h-3.5 text-blue-600" />
              Nome do Estabelecimento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Barba Negra Barbearia"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                setErrorMsg(null);
              }}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm font-medium transition-all"
              required
            />
          </div>

          {/* Campo 2: Place ID do Google */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-bold text-gray-700 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <span>Place ID do Google</span>
                <span className="text-red-500">*</span>
              </span>
              <span className="text-[11px] font-normal text-gray-400 lowercase">
                (ou cole o link completo)
              </span>
            </label>

            {/* Prefixo Fixo Visível */}
            <div className="bg-gray-100 border border-gray-200 rounded-t-xl px-3.5 py-1.5 text-[11px] font-mono text-gray-600 truncate select-all">
              {GOOGLE_REVIEW_PREFIX}
            </div>

            {/* Input do Place ID */}
            <input
              type="text"
              placeholder="Cole aqui o Place ID (ex: ChIJxxxxxxxxxxxxxxxx)"
              value={placeIdInput}
              onChange={handlePlaceIdChange}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-b-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:bg-white text-sm font-mono transition-all ${
                placeIdInput && !validation.isValid
                  ? 'border-red-400 focus:ring-red-500 bg-red-50/30'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
              required
            />

            {/* Feedback de Validação do Place ID */}
            {placeIdInput && !validation.isValid && (
              <p className="text-[11px] text-red-600 font-medium">
                {validation.error}
              </p>
            )}
          </div>

          {/* Prévia do Link Completo Gerado */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
              Link que será salvo:
            </span>
            <div className="font-mono text-xs text-blue-600 font-semibold break-all select-all">
              {previewUrl || (
                <span className="text-gray-400 font-normal italic">
                  {GOOGLE_REVIEW_PREFIX}[PLACE_ID]
                </span>
              )}
            </div>
          </div>

          {/* Botão LOCALIZAR PLACE ID */}
          <div className="pt-0.5">
            <a
              href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl border border-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span>LOCALIZAR PLACE ID</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            <p className="text-[11px] text-gray-400 text-center mt-1">
              Pesquise o estabelecimento pelo nome e cidade, confirme o endereço e copie o Place ID.
            </p>
          </div>

          {/* Seção de Teste do Link */}
          <div className="border-t border-gray-200 pt-3 space-y-3">
            {/* Botão Testar Link */}
            <button
              type="button"
              onClick={handleTestLink}
              disabled={!validation.isValid || !cleanPlaceId}
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-900 font-bold text-xs rounded-xl border-2 border-blue-600 text-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:border-gray-300 disabled:text-gray-400 shadow-2xs"
            >
              <ExternalLink className="w-4 h-4 text-blue-600" />
              <span>TESTAR LINK (ABRE EM NOVA ABA)</span>
            </button>

            {/* Confirmação Interativa pós-teste */}
            {hasOpenedTest && !isLinkConfirmed && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl space-y-2 animate-in fade-in">
                <p className="text-xs font-bold text-blue-900 text-center">
                  O link abriu o estabelecimento correto?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHasOpenedTest(false);
                      setIsLinkConfirmed(false);
                    }}
                    className="py-2 px-3 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl border border-gray-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-gray-500" />
                    <span>VOLTAR E CORRIGIR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLinkConfirmed(true)}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>SIM, ESTÁ CORRETO</span>
                  </button>
                </div>
              </div>
            )}

            {/* Feedback quando o link foi confirmado com sucesso */}
            {isLinkConfirmed && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Link testado e confirmado com sucesso!</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsLinkConfirmed(false);
                    setHasOpenedTest(false);
                  }}
                  className="text-[11px] text-emerald-700 underline hover:text-emerald-900 font-medium"
                >
                  Retestar
                </button>
              </div>
            )}
          </div>

          {/* Botão Final: CONFIRMAR E VINCULAR */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleConfirmAndLink}
              disabled={!isFormReady}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-extrabold rounded-2xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>VINCULANDO PLACA...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>CONFIRMAR E VINCULAR</span>
                </>
              )}
            </button>

            {!isFormReady && (
              <p className="text-[11px] text-gray-400 text-center mt-2">
                {!businessName.trim()
                  ? 'Preencha o nome do estabelecimento para habilitar.'
                  : !validation.isValid
                  ? 'Informe um Place ID válido para habilitar.'
                  : !hasOpenedTest
                  ? 'Clique em "TESTAR LINK" antes de vincular.'
                  : !isLinkConfirmed
                  ? 'Confirme se o estabelecimento aberto está correto.'
                  : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
