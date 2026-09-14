-- ==============================================================================
-- MIGRAÇÃO DE SEGURANÇA: AUTENTICAÇÃO ADMINISTRATIVA E SESSÕES REVOGÁVEIS
-- ==============================================================================
-- IMPORTANTE:
-- 1. Esta migration é estritamente ADITIVA. Ela NÃO modifica, apaga ou afeta
--    a tabela "public.plates", os 20 QR codes físicos nem os redirecionamentos.
-- 2. NÃO execute "schema_plates.sql" em produção pois ele possui políticas de
--    escrita pública de teste. Execute SOMENTE este arquivo no SQL Editor.
-- 3. Ambas as tabelas possuem RLS ativado e todos os privilégios revogados
--    de PUBLIC, anon, authenticated e service_role. Acesso concedido EXCLUSIVAMENTE
--    à service_role com privilégios mínimos necessários.
-- ==============================================================================

BEGIN;

-- 1. TABELA DE SESSÕES ADMINISTRATIVAS REVOGÁVEIS
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT pg_catalog.now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Revogar explicitamente TODOS os privilégios anteriores (inclusive service_role) antes de conceder o mínimo necessário
REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated, service_role;

-- Conceder apenas os privilégios mínimos necessários para a service_role (SELECT, INSERT, UPDATE)
GRANT SELECT, INSERT, UPDATE ON public.admin_sessions TO service_role;

-- Índices de performance para busca por token_hash e verificação de expiração
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions (expires_at);

COMMENT ON TABLE public.admin_sessions IS 'Sessões administrativas com hash SHA-256 do token e controle de expiração/revogação';
COMMENT ON COLUMN public.admin_sessions.token_hash IS 'Hash SHA-256 do token aleatório (o token bruto nunca é salvo)';
COMMENT ON COLUMN public.admin_sessions.expires_at IS 'Data e hora limite absoluta da sessão (12 horas a partir da criação)';
COMMENT ON COLUMN public.admin_sessions.revoked_at IS 'Timestamp de revogação explícita (preenchido no logout ou invalidação emergencial)';


-- 2. TABELA DE TENTATIVAS DE LOGIN (RATE LIMITING PERSISTENTE)
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT pg_catalog.now() NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Revogar explicitamente TODOS os privilégios anteriores (inclusive service_role) antes de conceder o mínimo necessário
REVOKE ALL ON public.admin_login_attempts FROM PUBLIC, anon, authenticated, service_role;

-- Conceder apenas os privilégios mínimos necessários para a service_role (SELECT, INSERT, DELETE)
GRANT SELECT, INSERT, DELETE ON public.admin_login_attempts TO service_role;

-- Índice otimizado para consultas por IP e janela temporal recente (ex: últimos 15 min)
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time ON public.admin_login_attempts (ip_address, attempted_at DESC);

COMMENT ON TABLE public.admin_login_attempts IS 'Registro persistente de tentativas de login administrativo para proteção contra força bruta';
COMMENT ON COLUMN public.admin_login_attempts.ip_address IS 'Endereço IP sanitizado da requisição de login';
COMMENT ON COLUMN public.admin_login_attempts.attempted_at IS 'Data e hora da tentativa registrada';


-- 3. FUNÇÃO ARMAZENADA ATÔMICA PARA CHECAGEM E REGISTRO DE RATE LIMITING
-- Utiliza pg_advisory_xact_lock para garantir atomicidade absoluta e serializar requisições concorrentes simultâneas do mesmo IP.
-- Define search_path = '' para proteção contra search_path hijacking e qualifica todos os objetos/funções com pg_catalog.
CREATE OR REPLACE FUNCTION public.check_and_record_login_attempt(
    p_ip TEXT,
    p_max_attempts INT DEFAULT 5,
    p_window_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_attempt_count INT;
    v_oldest_attempt TIMESTAMPTZ;
    v_retry_after INT := 0;
BEGIN
    -- Validação estrita de parâmetros de entrada
    IF p_ip IS NULL OR pg_catalog.btrim(p_ip) = '' THEN
        RAISE EXCEPTION 'Parâmetro p_ip não pode ser nulo ou vazio.';
    END IF;

    IF p_max_attempts IS NULL OR p_max_attempts <= 0 THEN
        RAISE EXCEPTION 'Parâmetro p_max_attempts deve ser maior que zero.';
    END IF;

    IF p_window_minutes IS NULL OR p_window_minutes <= 0 THEN
        RAISE EXCEPTION 'Parâmetro p_window_minutes deve ser maior que zero.';
    END IF;

    v_window_start := pg_catalog.now() - (p_window_minutes * interval '1 minute');

    -- Bloqueio transacional advisory exclusivo por hash de IP (serializa acessos simultâneos)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_login_rate_limit_' || p_ip));

    -- Contar tentativas do IP dentro da janela temporal usando pg_catalog.now() diretamente
    SELECT pg_catalog.count(*), pg_catalog.min(attempted_at)
    INTO v_attempt_count, v_oldest_attempt
    FROM public.admin_login_attempts
    WHERE ip_address = p_ip
      AND attempted_at >= v_window_start;

    -- Se já atingiu ou excedeu o limite máximo (registra até p_max_attempts chamadas por IP na janela)
    IF v_attempt_count >= p_max_attempts THEN
        v_retry_after := GREATEST(
            1,
            pg_catalog.ceil(
                EXTRACT(EPOCH FROM (
                    v_oldest_attempt
                    + (p_window_minutes * interval '1 minute')
                    - pg_catalog.now()
                ))
            )::INT
        );

        RETURN pg_catalog.jsonb_build_object(
            'allowed', false,
            'retry_after_seconds', v_retry_after,
            'attempts_count', v_attempt_count
        );
    END IF;

    -- Registrar a tentativa atomicamente dentro da mesma transação
    INSERT INTO public.admin_login_attempts (ip_address, attempted_at)
    VALUES (p_ip, pg_catalog.now());

    RETURN pg_catalog.jsonb_build_object(
        'allowed', true,
        'retry_after_seconds', 0,
        'attempts_count', v_attempt_count + 1
    );
END;
$$;

-- Restringir execução da Stored Procedure atômica dentro da mesma transação
REVOKE ALL ON FUNCTION public.check_and_record_login_attempt(TEXT, INT, INT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_record_login_attempt(TEXT, INT, INT) TO service_role;

COMMIT;

-- ==============================================================================
-- COMANDOS OPERACIONAIS E EMERGENCIAIS (DOCUMENTAÇÃO)
-- ==============================================================================
-- Para invalidar e desconectar IMEDIATAMENTE todas as sessões administrativas ativas:
--
--   UPDATE public.admin_sessions 
--   SET revoked_at = pg_catalog.now() 
--   WHERE revoked_at IS NULL;
--
-- Para limpar tentativas antigas de login com mais de 7 dias:
--
--   DELETE FROM public.admin_login_attempts 
--   WHERE attempted_at < pg_catalog.now() - interval '7 days';
-- ==============================================================================
