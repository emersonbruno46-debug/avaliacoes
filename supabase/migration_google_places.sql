-- ==============================================================================
-- MIGRAÇÃO NÃO-DESTRUTIVA: GOOGLE PLACES PARA PLACAS NFC EXISTENTES
-- ==============================================================================
-- IMPORTANTE: Este script adiciona novas colunas à tabela "plates" já existente
-- SEM apagar ou recriar dados, QR codes, slugs ou políticas anteriores.
-- Execute este script no SQL Editor do seu projeto Supabase.
-- ==============================================================================

-- 1. Adicionar colunas necessárias para vincular estabelecimentos do Google
ALTER TABLE public.plates
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_verified_at TIMESTAMPTZ;

-- 2. Índice para otimização de consultas por google_place_id (não único)
-- Permite que uma mesma empresa adquira múltiplas placas para diferentes balcões
CREATE INDEX IF NOT EXISTS idx_plates_google_place_id ON public.plates (google_place_id);

-- 3. Comentários para documentação das novas colunas
COMMENT ON COLUMN public.plates.business_name IS 'Nome fantasia do estabelecimento obtido do Google Places';
COMMENT ON COLUMN public.plates.formatted_address IS 'Endereço completo e formatado retornado pela API do Google';
COMMENT ON COLUMN public.plates.google_place_id IS 'Identificador único do estabelecimento no Google Places';
COMMENT ON COLUMN public.plates.linked_at IS 'Data e hora da vinculação do estabelecimento à placa';
COMMENT ON COLUMN public.plates.link_verified_at IS 'Data e hora em que o administrador testou e confirmou o link antes de salvar';
