import QRCode from 'qrcode';

export interface QRGenerateOptions {
  includeLabel?: boolean;
}

/**
 * Gera o código SVG vetorial puro para o QR Code da placa.
 * Se includeLabel for true, adiciona o ID centralizado abaixo do QR Code.
 */
export async function generatePlateSVG(
  targetUrl: string,
  code: string,
  options: QRGenerateOptions = {}
): Promise<string> {
  const rawSvg = await QRCode.toString(targetUrl, {
    type: 'svg',
    margin: 3,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  if (!options.includeLabel) {
    return rawSvg;
  }

  // Se incluir label, ajustar viewBox e adicionar o texto do código centralizado na parte inferior
  try {
    const viewBoxMatch = rawSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (viewBoxMatch) {
      const width = parseInt(viewBoxMatch[1], 10);
      const originalHeight = parseInt(viewBoxMatch[2], 10);
      const extraHeight = Math.round(width * 0.18);
      const newHeight = originalHeight + extraHeight;

      let modifiedSvg = rawSvg.replace(
        `viewBox="0 0 ${width} ${originalHeight}"`,
        `viewBox="0 0 ${width} ${newHeight}"`
      );

      // Adicionar fundo estendido e texto centralizado antes do </svg>
      const textY = originalHeight + Math.round(extraHeight * 0.65);
      const fontSize = Math.round(width * 0.08);

      const labelElement = `
        <rect x="0" y="${originalHeight}" width="${width}" height="${extraHeight}" fill="#FFFFFF" />
        <text x="50%" y="${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="${fontSize}" fill="#000000" letter-spacing="2">${code}</text>
      </svg>`;

      modifiedSvg = modifiedSvg.replace('</svg>', labelElement);
      return modifiedSvg;
    }
  } catch (err) {
    console.error('Erro ao injetar label no SVG:', err);
  }

  return rawSvg;
}

/**
 * Gera a Data URL em PNG para o QR Code da placa.
 * Se includeLabel for true, desenha o canvas com o código centralizado na parte inferior.
 */
export async function generatePlatePNG(
  targetUrl: string,
  code: string,
  options: QRGenerateOptions = {}
): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 600,
    margin: 3,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  if (!options.includeLabel) {
    return qrDataUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(qrDataUrl);
        return;
      }

      const qrWidth = img.width;
      const qrHeight = img.height;
      const labelHeight = Math.round(qrWidth * 0.16);

      canvas.width = qrWidth;
      canvas.height = qrHeight + labelHeight;

      // Fundo branco
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Desenhar QR Code
      ctx.drawImage(img, 0, 0);

      // Desenhar texto do ID centralizado
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(qrWidth * 0.07)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(code, canvas.width / 2, qrHeight + labelHeight / 2);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => reject(err);
    img.src = qrDataUrl;
  });
}
