-- Execute este script no SQL Editor do seu projeto no Supabase

CREATE TABLE IF NOT EXISTS public.links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    destination_url TEXT NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar Row Level Security (RLS)
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Público para MVP
-- Permitir leitura pública dos links (necessário para redirecionamento)
CREATE POLICY "Permitir leitura de links" ON public.links
    FOR SELECT USING (true);

-- Permitir inserção de novos links via cliente/anon
CREATE POLICY "Permitir inserção de links" ON public.links
    FOR INSERT WITH CHECK (true);

-- Permitir atualização de links (para desativar ou alterar destination_url)
CREATE POLICY "Permitir atualização de links" ON public.links
    FOR UPDATE USING (true);

-- Criar índice para buscas ultra rápidas por slug
CREATE INDEX IF NOT EXISTS idx_links_slug ON public.links (slug);
