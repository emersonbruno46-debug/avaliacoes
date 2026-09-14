/**
 * Utilitário de Extração, Validação e Geração de URL para Google Place ID
 *
 * Funciona de forma 100% autônoma, sem dependência de scripts externos ou APIs pagas do Google.
 */

export const GOOGLE_REVIEW_PREFIX = 'https://search.google.com/local/writereview?placeid=';

export interface PlaceIdValidationResult {
  isValid: boolean;
  placeId: string;
  error?: string;
}

/**
 * Extrai e valida um Google Place ID.
 * Suporta a inserção de apenas o Place ID ou de uma URL completa de avaliação.
 */
export function extractAndValidatePlaceId(rawInput: string): PlaceIdValidationResult {
  if (!rawInput) {
    return { isValid: false, placeId: '', error: 'Informe o Place ID do Google.' };
  }

  let cleaned = rawInput.trim();

  // Se o usuário colou uma URL completa ou com parâmetros de consulta
  if (cleaned.includes('placeid=')) {
    try {
      const match =
        cleaned.match(/[?&]placeid=([^&#\s]+)/i) || cleaned.match(/placeid=([^&#\s]+)/i);
      if (match && match[1]) {
        cleaned = decodeURIComponent(match[1]).trim();
      } else {
        return {
          isValid: false,
          placeId: '',
          error: 'Place ID não encontrado na URL informada.',
        };
      }
    } catch {
      return {
        isValid: false,
        placeId: '',
        error: 'Não foi possível extrair o Place ID da URL.',
      };
    }
  } else if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return {
      isValid: false,
      placeId: '',
      error: 'A URL informada não contém o parâmetro placeid.',
    };
  }

  if (!cleaned) {
    return { isValid: false, placeId: '', error: 'O Place ID não pode ser vazio.' };
  }

  // Rejeitar espaços internos
  if (/\s/.test(cleaned)) {
    return {
      isValid: false,
      placeId: '',
      error: 'Place ID inválido: não são permitidos espaços.',
    };
  }

  // Limite de tamanho entre 5 e 300 caracteres
  if (cleaned.length < 5 || cleaned.length > 300) {
    return {
      isValid: false,
      placeId: '',
      error: 'Place ID inválido: o tamanho deve ter entre 5 e 300 caracteres.',
    };
  }

  // Permitir letras maiúsculas/minúsculas, números, hífen e underline
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    return {
      isValid: false,
      placeId: '',
      error:
        'Place ID inválido: utilize apenas letras, números, hífen (-) e underline (_).',
    };
  }

  return { isValid: true, placeId: cleaned };
}

/**
 * Gera de forma segura e padronizada a URL oficial de avaliação do Google
 */
export function buildGoogleReviewUrl(placeId: string): string {
  const clean = placeId.trim();
  return `${GOOGLE_REVIEW_PREFIX}${encodeURIComponent(clean)}`;
}
