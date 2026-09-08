-- Execute este script no SQL Editor do seu projeto no Supabase

CREATE TABLE IF NOT EXISTS public.plates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    company_name TEXT NULL,
    destination_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar Row Level Security (RLS)
ALTER TABLE public.plates ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Público para o MVP
CREATE POLICY "Permitir leitura de placas" ON public.plates
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserção de placas" ON public.plates
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de placas" ON public.plates
    FOR UPDATE USING (true);

-- Criar índice para busca ultra-rápida por código da placa
CREATE INDEX IF NOT EXISTS idx_plates_code ON public.plates (code);
