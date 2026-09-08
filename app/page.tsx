'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { generateUniquePlateCode } from '@/lib/codeGenerator';
import { generatePlateSVG, generatePlatePNG } from '@/lib/qrHelper';
import { Plate } from '@/lib/types';
import QRCodePlateModal from '@/components/QRCodePlateModal';
import ActivatePlateModal from '@/components/ActivatePlateModal';
import AdminLoginPage from '@/app/admin/page';
import {
  Plus,
  Layers,
  Search,
  Download,
  QrCode,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Edit,
  Tag,
  Store,
  Globe,
  Archive,
  LogOut,
  Trash2,
  AlertCircle,
} from 'lucide-react';

export default function StockPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modais
  const [viewingPlate, setViewingPlate] = useState<Plate | null>(null);
  const [activatingPlate, setActivatingPlate] = useState<Plate | null>(null);
  const [deletingPlate, setDeletingPlate] = useState<Plate | null>(null);
  
  // Geração de Lote
  const [batchQuantity, setBatchQuantity] = useState<number>(10);
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [batchGenerating, setBatchGenerating] = useState<boolean>(false);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [singleGenerating, setSingleGenerating] = useState<boolean>(false);
  const [deletingLoading, setDeletingLoading] = useState<boolean>(false);

  const [baseUrl, setBaseUrl] = useState<string>('http://localhost:3000');

  useEffect(() => {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) {
      setBaseUrl(envUrl.replace(/\/$/, ''));
    } else if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }

    checkAuthAndFetch();
  }, []);

  const checkAuthAndFetch = async () => {
    setLoading(true);
    try {
      const authRes = await fetch('/api/admin/check');
      const authData = await authRes.json();

      if (authData.authenticated) {
        setAuthenticated(true);
        await fetchPlates();
      } else {
        setAuthenticated(false);
      }
    } catch (err) {
      console.error('Erro ao verificar autenticação:', err);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlates = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar estoque de placas:', error);
      } else if (data) {
        setPlates(data as Plate[]);
      }
    } catch (err) {
      console.error('Falha na busca:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      setAuthenticated(false);
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  };

  /**
   * GERAR NOVA PLACA (Individual protegida por API)
   */
  const handleGenerateSingle = async () => {
    setSingleGenerating(true);
    try {
      const uniqueCode = await generateUniquePlateCode();

      const newPlateData = {
        code: uniqueCode,
        status: 'available',
        company_name: null,
        destination_url: null,
      };

      const res = await fetch('/api/admin/plates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plates: [newPlateData] }),
      });

      const json = await res.json();

      if (res.ok && json.success && json.data?.[0]) {
        const created = json.data[0] as Plate;
        setPlates((prev) => [created, ...prev]);
        setViewingPlate(created);
      } else {
        alert(`Erro ao criar placa: ${json.error || 'Falha na requisição'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao gerar placa.');
    } finally {
      setSingleGenerating(false);
    }
  };

  /**
   * GERAR LOTE DE PLACAS (10, 20, 50, 100)
   */
  const handleGenerateBatch = async () => {
    setBatchGenerating(true);
    try {
      const newPlatesToInsert = [];

      for (let i = 0; i < batchQuantity; i++) {
        const code = await generateUniquePlateCode();
        newPlatesToInsert.push({
          code,
          status: 'available',
          company_name: null,
          destination_url: null,
        });
      }

      const res = await fetch('/api/admin/plates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plates: newPlatesToInsert }),
      });

      const json = await res.json();

      if (res.ok && json.success && Array.isArray(json.data)) {
        setPlates((prev) => [...(json.data as Plate[]), ...prev]);
        setShowBatchModal(false);
      } else {
        alert(`Erro ao gerar lote: ${json.error || 'Falha na requisição'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Falha ao gerar lote de placas.');
    } finally {
      setBatchGenerating(false);
    }
  };

  /**
   * REMOVER / APAGAR PLACA
   */
  const confirmDeletePlate = async () => {
    if (!deletingPlate) return;
    setDeletingLoading(true);

    try {
      const res = await fetch(`/api/admin/plates?id=${deletingPlate.id}`, {
        method: 'DELETE',
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setPlates((prev) => prev.filter((p) => p.id !== deletingPlate.id));
        setDeletingPlate(null);
      } else {
        alert(`Erro ao remover placa: ${json.error || 'Falha na requisição'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao deletar placa.');
    } finally {
      setDeletingLoading(false);
    }
  };

  /**
   * DOWNLOAD DO LOTE EM ZIP
   */
  const handleDownloadZip = async () => {
    if (filteredPlates.length === 0) return;
    setDownloadingZip(true);

    try {
      const zip = new JSZip();
      const folderSvg = zip.folder('SVG-Vetorial');
      const folderPng = zip.folder('PNG-Imagens');

      for (const plate of filteredPlates) {
        const targetUrl = `${baseUrl.replace(/\/$/, '')}/p/${plate.code}`;
        const svgContent = await generatePlateSVG(targetUrl, plate.code, {
          includeLabel: true,
        });
        const pngDataUrl = await generatePlatePNG(targetUrl, plate.code, {
          includeLabel: true,
        });

        folderSvg?.file(`QR-${plate.code}.svg`, svgContent);

        const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');
        folderPng?.file(`QR-${plate.code}.png`, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `LOTE-PLACAS-QRCODE-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Erro ao gerar arquivo ZIP:', err);
      alert('Falha ao criar o arquivo ZIP de exportação.');
    } finally {
      setDownloadingZip(false);
    }
  };

  // Se ainda estiver carregando status de auth
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans text-gray-500 text-sm">
        Verificando autenticação...
      </div>
    );
  }

  // Se não estiver autenticado, exibir a tela de Login
  if (!authenticated) {
    return <AdminLoginPage />;
  }

  const filteredPlates = plates.filter((p) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const matchCode = p.code.toLowerCase().includes(query);
    const matchCompany = p.company_name
      ? p.company_name.toLowerCase().includes(query)
      : false;
    return matchCode || matchCompany;
  });

  const availableCount = plates.filter((p) => p.status === 'available').length;
  const activeCount = plates.filter((p) => p.status === 'active').length;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
                <Archive className="w-3.5 h-3.5" />
                Painel Administrativo
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              ESTOQUE DE PLACAS
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Gere QR Codes de placas físicas antes da venda e vincule ao Google posteriormente.
            </p>
          </div>

          {/* Botões Principais no Topo */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleGenerateSingle}
              disabled={singleGenerating}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50"
            >
              {singleGenerating ? (
                <span>Gerando ID...</span>
              ) : (
                <>
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>GERAR NOVA PLACA</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl text-sm transition-all shadow-sm"
            >
              <Layers className="w-4 h-4" />
              <span>GERAR LOTE</span>
            </button>

            {filteredPlates.length > 0 && (
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-sm transition-all shadow-sm disabled:opacity-50"
                title="Baixar arquivos SVG/PNG do lote em arquivo ZIP"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingZip ? 'Compactando...' : 'BAIXAR TODOS'}</span>
              </button>
            )}

            {/* Botão SAIR */}
            <button
              onClick={handleLogout}
              className="p-3 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-2xl transition-colors border border-gray-200"
              title="Sair do Painel (Logout)"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {!isSupabaseConfigured() && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Modo de Demonstração (Sem Supabase):</strong> Configure as credenciais do Supabase no <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env.local</code> para salvar no banco.
            </div>
          </div>
        )}

        {/* Barra de Busca e Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2 relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por ID da placa (ex: A7K2X) ou Empresa (ex: Vish Clean)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-md"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex items-center justify-around bg-white p-3 border border-gray-200 rounded-2xl shadow-xs text-xs font-semibold">
            <div className="text-center">
              <span className="text-gray-400 block uppercase tracking-wider text-[10px]">Total</span>
              <span className="text-base font-black text-gray-900">{plates.length}</span>
            </div>
            <div className="h-6 w-px bg-gray-200" />
            <div className="text-center">
              <span className="text-blue-600 block uppercase tracking-wider text-[10px]">Disponíveis</span>
              <span className="text-base font-black text-blue-700">{availableCount}</span>
            </div>
            <div className="h-6 w-px bg-gray-200" />
            <div className="text-center">
              <span className="text-green-600 block uppercase tracking-wider text-[10px]">Ativas</span>
              <span className="text-base font-black text-green-700">{activeCount}</span>
            </div>
          </div>
        </div>

        {/* Listagem de Placas */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span>Placas em Estoque</span>
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-mono">
                {filteredPlates.length}
              </span>
            </h2>
            <button
              onClick={fetchPlates}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar</span>
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-sm text-gray-400">
              Carregando estoque de placas...
            </div>
          ) : filteredPlates.length === 0 ? (
            <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center space-y-3">
              <QrCode className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-semibold text-gray-600">
                {searchQuery
                  ? 'Nenhuma placa encontrada para esta busca.'
                  : 'Nenhuma placa física gerada ainda.'}
              </p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Clique no botão <strong>GERAR NOVA PLACA</strong> no topo para criar sua primeira placa física.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPlates.map((plate) => {
                const isAvailable = plate.status === 'available';

                return (
                  <div
                    key={plate.id}
                    className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                  >
                    {/* Linha 1: ID, Badge e Botão Remover */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-blue-600" />
                        <span className="font-mono font-black text-xl text-gray-900 tracking-wider">
                          {plate.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                            isAvailable
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-green-50 text-green-700 border-green-200'
                          }`}
                        >
                          {isAvailable ? 'Disponível' : 'Ativa'}
                        </span>
                        
                        {/* Botão Remover Placa */}
                        <button
                          onClick={() => setDeletingPlate(plate)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remover / Apagar Placa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Linha 2: Empresa e Destino */}
                    <div className="space-y-1.5 text-xs border-t border-b border-gray-100 py-3">
                      <div className="flex items-center justify-between text-gray-600">
                        <span className="flex items-center gap-1 font-medium text-gray-500">
                          <Store className="w-3.5 h-3.5 text-gray-400" />
                          Empresa:
                        </span>
                        <span className="font-bold text-gray-900 truncate max-w-[200px]">
                          {plate.company_name || '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-gray-600">
                        <span className="flex items-center gap-1 font-medium text-gray-500">
                          <Globe className="w-3.5 h-3.5 text-gray-400" />
                          Destino Google:
                        </span>
                        {plate.destination_url ? (
                          <a
                            href={plate.destination_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-600 font-medium hover:underline truncate max-w-[200px]"
                          >
                            {plate.destination_url}
                          </a>
                        ) : (
                          <span className="text-gray-400 font-mono">—</span>
                        )}
                      </div>
                    </div>

                    {/* Linha 3: Ações */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setViewingPlate(plate)}
                        className="flex-1 py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                      >
                        <QrCode className="w-4 h-4 text-gray-600" />
                        <span>VER QR</span>
                      </button>

                      {isAvailable ? (
                        <button
                          onClick={() => setActivatingPlate(plate)}
                          className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>ATIVAR</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setActivatingPlate(plate)}
                          className="flex-1 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Edit className="w-4 h-4" />
                          <span>EDITAR</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal Visualizador do QR Code */}
      {viewingPlate && (
        <QRCodePlateModal
          plate={viewingPlate}
          baseUrl={baseUrl}
          onClose={() => setViewingPlate(null)}
        />
      )}

      {/* Modal de Ativação / Edição de Placa */}
      {activatingPlate && (
        <ActivatePlateModal
          plate={activatingPlate}
          onClose={() => setActivatingPlate(null)}
          onSuccess={fetchPlates}
        />
      )}

      {/* Modal de Confirmação para REMOVER PLACA */}
      {deletingPlate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-gray-900">
                Remover Placa <span className="font-mono text-red-600">{deletingPlate.code}</span>?
              </h3>
              <p className="text-xs text-gray-500">
                Tem certeza que deseja apagar esta placa física do estoque? Essa ação é irreversível.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPlate(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeletePlate}
                disabled={deletingLoading}
                className="flex-1 py-3 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingLoading ? 'Removendo...' : 'APAGAR'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Geração de Lote */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-sm w-full p-6 space-y-5">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              GERAR LOTE DE PLACAS
            </h3>

            <p className="text-xs text-gray-500">
              Escolha a quantidade de placas físicas para criar automaticamente no seu estoque:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[10, 20, 50, 100].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setBatchQuantity(qty)}
                  className={`py-3 px-4 rounded-xl font-mono text-base font-bold border transition-all ${
                    batchQuantity === qty
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-gray-50 text-gray-800 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {qty} Placas
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateBatch}
                disabled={batchGenerating}
                className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                {batchGenerating ? 'Gerando...' : 'GERAR LOTE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
