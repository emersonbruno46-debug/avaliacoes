'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Check, ExternalLink, QrCode } from 'lucide-react';

interface QRCodeDisplayProps {
  slug: string;
  name: string;
  baseUrl: string;
}

export default function QRCodeDisplay({ slug, name, baseUrl }: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [svgString, setSvgString] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fullUrl = `${baseUrl.replace(/\/$/, '')}/${slug}`;

  useEffect(() => {
    if (!slug) return;

    // Gerar versão PNG (Data URL Canvas)
    QRCode.toDataURL(
      fullUrl,
      {
        width: 400,
        margin: 2,
        color: {
          dark: '#111827',
          light: '#FFFFFF',
        },
      },
      (err, url) => {
        if (err) {
          console.error('Erro ao gerar QR PNG:', err);
          return;
        }
        setDataUrl(url);
      }
    );

    // Gerar versão SVG
    QRCode.toString(
      fullUrl,
      {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#111827',
          light: '#FFFFFF',
        },
      },
      (err, string) => {
        if (err) {
          console.error('Erro ao gerar QR SVG:', err);
          return;
        }
        setSvgString(string);
      }
    );
  }, [fullUrl, slug]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
    }
  };

  const downloadPNG = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qrcode-${slug}.png`;
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
    link.download = `qrcode-${slug}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col items-center">
      <div className="flex items-center gap-2 mb-2 text-gray-800 font-semibold text-lg text-center">
        <QrCode className="w-5 h-5 text-blue-600" />
        <span>QR Code Gerado - {name}</span>
      </div>

      <p className="text-xs text-gray-500 mb-6 text-center max-w-sm">
        Imprima este QR Code na placa física. Ele aponta para o seu domínio e permite redirecionamento dinâmico.
      </p>

      {/* QR Code Canvas / Imagem */}
      <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl mb-6 shadow-inner flex items-center justify-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR Code para ${fullUrl}`}
            className="w-56 h-56 rounded-lg object-contain bg-white p-2 shadow-sm"
          />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center text-gray-400 text-sm">
            Gerando QR Code...
          </div>
        )}
      </div>

      {/* Exibição da URL Completa */}
      <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 mb-6 flex items-center justify-between gap-2 text-sm">
        <span className="font-mono text-gray-800 font-medium truncate select-all">
          {fullUrl}
        </span>
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-blue-600 p-1 transition-colors"
          title="Testar link no navegador"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Botões de Ação Solicitados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <button
          type="button"
          onClick={copyToClipboard}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar Link</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={downloadPNG}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Baixar PNG</span>
        </button>

        <button
          type="button"
          onClick={downloadSVG}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Baixar SVG</span>
        </button>
      </div>
    </div>
  );
}
