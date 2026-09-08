'use client';

import { useEffect, useState } from 'react';
import { generatePlatePNG, generatePlateSVG } from '@/lib/qrHelper';
import { Plate } from '@/lib/types';
import {
  X,
  Copy,
  Download,
  Check,
  ExternalLink,
  QrCode,
  Tag,
  FileCode,
  FileImage,
} from 'lucide-react';

interface QRCodePlateModalProps {
  plate: Plate | null;
  baseUrl: string;
  onClose: () => void;
}

export default function QRCodePlateModal({
  plate,
  baseUrl,
  onClose,
}: QRCodePlateModalProps) {
  const [includeLabel, setIncludeLabel] = useState<boolean>(true);
  const [pngDataUrl, setPngDataUrl] = useState<string>('');
  const [svgString, setSvgString] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  if (!plate) return null;

  const targetUrl = `${baseUrl.replace(/\/$/, '')}/p/${plate.code}`;

  useEffect(() => {
    if (!plate) return;

    let isMounted = true;
    setLoading(true);

    async function loadQR() {
      if (!plate) return;
      try {
        const png = await generatePlatePNG(targetUrl, plate.code, {
          includeLabel,
        });
        const svg = await generatePlateSVG(targetUrl, plate.code, {
          includeLabel,
        });

        if (isMounted) {
          setPngDataUrl(png);
          setSvgString(svg);
          setLoading(false);
        }
      } catch (err) {
        console.error('Erro ao gerar QR Code:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadQR();

    return () => {
      isMounted = false;
    };
  }, [targetUrl, plate, includeLabel]);

  const copyUrlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const copyIdToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(plate.code);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const downloadPNG = () => {
    if (!pngDataUrl) return;
    const link = document.createElement('a');
    link.href = pngDataUrl;
    link.download = `QR-${plate.code}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSVG = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QR-${plate.code}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Título & Badge */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <QrCode className="w-3.5 h-3.5" />
            Placa Física Gerada
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            ID: <span className="font-mono text-blue-600">{plate.code}</span>
          </h2>
          <div className="flex items-center justify-center gap-2 text-xs">
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold ${
                plate.status === 'active'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {plate.status === 'active'
                ? `Ativa (${plate.company_name})`
                : 'Disponível / Não ativada'}
            </span>
          </div>
        </div>

        {/* Seletor de Formato do QR Code */}
        <div className="flex justify-center bg-gray-100 p-1 rounded-xl text-xs font-medium text-gray-600 max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => setIncludeLabel(true)}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all ${
              includeLabel
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            QR + ID Embaixo
          </button>
          <button
            type="button"
            onClick={() => setIncludeLabel(false)}
            className={`flex-1 py-1.5 px-3 rounded-lg transition-all ${
              !includeLabel
                ? 'bg-white text-gray-900 shadow-xs font-bold'
                : 'hover:text-gray-900'
            }`}
          >
            QR Puro
          </button>
        </div>

        {/* Preview do QR Code */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner min-h-[260px]">
          {loading ? (
            <div className="text-sm text-gray-400 font-medium">
              Gerando visualização vetorial...
            </div>
          ) : pngDataUrl ? (
            <img
              src={pngDataUrl}
              alt={`QR Code para ${plate.code}`}
              className="max-w-[220px] max-h-[260px] object-contain bg-white p-3 rounded-xl shadow-sm border border-gray-200"
            />
          ) : (
            <div className="text-sm text-gray-400">Falha ao carregar QR</div>
          )}
        </div>

        {/* Informações da URL e ID */}
        <div className="space-y-2 bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500 font-medium">URL Gravada no QR:</span>
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 font-mono font-bold hover:underline truncate flex items-center gap-1"
            >
              <span>{targetUrl}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {plate.company_name && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-200/60 pt-2">
              <span className="text-gray-500 font-medium">Empresa Vinculada:</span>
              <span className="font-bold text-gray-800 truncate">
                {plate.company_name}
              </span>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={downloadSVG}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
            title="Ideal para CorelDRAW e Gráfica (Vetorial Puro)"
          >
            <FileCode className="w-4 h-4" />
            <span>BAIXAR SVG</span>
          </button>

          <button
            type="button"
            onClick={downloadPNG}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
          >
            <FileImage className="w-4 h-4" />
            <span>BAIXAR PNG</span>
          </button>

          <button
            type="button"
            onClick={copyUrlToClipboard}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span>URL Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPIAR URL</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={copyIdToClipboard}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl transition-colors border border-gray-300"
          >
            {copiedId ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span>ID Copiado!</span>
              </>
            ) : (
              <>
                <Tag className="w-3.5 h-3.5 text-gray-600" />
                <span>COPIAR ID</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
