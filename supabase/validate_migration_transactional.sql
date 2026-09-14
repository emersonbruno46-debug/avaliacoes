-- ==============================================================================
-- SCRIPT DE VALIDAÇÃO TRANSACIONAL DE SEGURANÇA E MIGRATION (100% DESFAZÍVEL)
-- ==============================================================================
-- INSTRUÇÕES DE EXECUÇÃO MANUAL NO SQL EDITOR DO SUPABASE:
-- 1. Copie todo o código abaixo e cole no SQL Editor do seu projeto Supabase.
-- 2. Clique em "Run". O script executa dentro de uma transação (BEGIN ... ROLLBACK).
-- 3. Ele cria temporariamente os objetos, testa 6 chamadas sequenciais da RPC,
--    valida as permissões das roles (anon, authenticated e service_role) e no final
--    executa ROLLBACK;.
-- 4. O banco de dados retornará 100% ao estado original (nenhuma tabela ou registro
--    será mantido ou alterado).
-- 5. ATENÇÃO: Se por qualquer motivo ocorrer erro de sintaxe ou interrupção manual,
--    execute o comando "ROLLBACK;" na aba do SQL Editor antes de continuar.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- PARTE 1: MIGRATION ADITIVA (OBJETOS CRIADOS DENTRO DA TRANSAÇÃO TEMPORÁRIA)
-- ==============================================================================

-- 1. TABELA DE SESSÕES ADMINISTRATIVAS REVOGÁVEIS
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT pg_catalog.now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL
);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.admin_sessions TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions (expires_at);

-- 2. TABELA DE TENTATIVAS DE LOGIN (RATE LIMITING PERSISTENTE)
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT pg_catalog.now() NOT NULL
);

ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_login_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.admin_login_attempts TO service_role;

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time ON public.admin_login_attempts (ip_address, attempted_at DESC);

-- 3. FUNÇÃO ARMAZENADA ATÔMICA PARA CHECAGEM E REGISTRO DE RATE LIMITING
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

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('admin_login_rate_limit_' || p_ip));

    SELECT pg_catalog.count(*), pg_catalog.min(attempted_at)
    INTO v_attempt_count, v_oldest_attempt
    FROM public.admin_login_attempts
    WHERE ip_address = p_ip
      AND attempted_at >= v_window_start;

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

    INSERT INTO public.admin_login_attempts (ip_address, attempted_at)
    VALUES (p_ip, pg_catalog.now());

    RETURN pg_catalog.jsonb_build_object(
        'allowed', true,
        'retry_after_seconds', 0,
        'attempts_count', v_attempt_count + 1
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_record_login_attempt(TEXT, INT, INT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_record_login_attempt(TEXT, INT, INT) TO service_role;


-- ==============================================================================
-- PARTE 2: BLOCO PL/PGSQL DE TESTE SEQUENCIAL E VERIFICAÇÃO DE PERMISSÕES
-- ==============================================================================

DO $$
DECLARE
    v_test_ip TEXT := 'val_exclusive_test_ip_999_999_999_999';
    v_res JSONB;
    v_i INT;
    v_allowed BOOLEAN;
    v_retry_after INT;

    -- Variáveis de checagem de privilégios de tabela e RPC
    v_anon_sessions_sel BOOLEAN;
    v_anon_sessions_ins BOOLEAN;
    v_anon_attempts_sel BOOLEAN;
    v_anon_attempts_ins BOOLEAN;
    v_anon_rpc_exec BOOLEAN;

    v_auth_sessions_sel BOOLEAN;
    v_auth_sessions_ins BOOLEAN;
    v_auth_attempts_sel BOOLEAN;
    v_auth_attempts_ins BOOLEAN;
    v_auth_rpc_exec BOOLEAN;

    v_sr_sessions_sel BOOLEAN;
    v_sr_sessions_ins BOOLEAN;
    v_sr_sessions_upd BOOLEAN;
    v_sr_attempts_sel BOOLEAN;
    v_sr_attempts_ins BOOLEAN;
    v_sr_attempts_del BOOLEAN;
    v_sr_rpc_exec BOOLEAN;
BEGIN
    RAISE NOTICE '----------------------------------------------------------------------';
    RAISE NOTICE 'INICIANDO VALIDAÇÃO TRANSACIONAL DE SEGURANÇA E RATE LIMITING';
    RAISE NOTICE '----------------------------------------------------------------------';

    -- 1. Executar a RPC 6 vezes sequencialmente para o IP exclusivo de teste
    FOR v_i IN 1..6 LOOP
        v_res := public.check_and_record_login_attempt(v_test_ip, 5, 15);
        v_allowed := (v_res->>'allowed')::BOOLEAN;
        v_retry_after := (v_res->>'retry_after_seconds')::INT;

        RAISE NOTICE 'Chamada %/6 para IP %: allowed = %, retry_after_seconds = %',
            v_i, v_test_ip, v_allowed, v_retry_after;

        IF v_i <= 5 THEN
            IF v_allowed IS NOT TRUE THEN
                RAISE EXCEPTION 'FALHA NO TESTE SEQUENCIAL: Chamada % deveria retornar allowed=true', v_i;
            END IF;
        ELSE
            IF v_allowed IS NOT FALSE OR v_retry_after <= 0 THEN
                RAISE EXCEPTION 'FALHA NO TESTE SEQUENCIAL: Chamada % (excedente) deveria retornar allowed=false e retry_after_seconds > 0', v_i;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE '✔ SUCESSO: Chamadas 1 a 5 permitidas e 6ª chamada bloqueada com sucesso com Retry-After!';
    RAISE NOTICE '----------------------------------------------------------------------';

    -- 2. Verificar privilégios das roles (anon, authenticated, service_role)
    -- Role 'anon'
    v_anon_sessions_sel := has_table_privilege('anon', 'public.admin_sessions', 'SELECT');
    v_anon_sessions_ins := has_table_privilege('anon', 'public.admin_sessions', 'INSERT');
    v_anon_attempts_sel := has_table_privilege('anon', 'public.admin_login_attempts', 'SELECT');
    v_anon_attempts_ins := has_table_privilege('anon', 'public.admin_login_attempts', 'INSERT');
    v_anon_rpc_exec     := has_function_privilege('anon', 'public.check_and_record_login_attempt(text,int,int)', 'EXECUTE');

    -- Role 'authenticated'
    v_auth_sessions_sel := has_table_privilege('authenticated', 'public.admin_sessions', 'SELECT');
    v_auth_sessions_ins := has_table_privilege('authenticated', 'public.admin_sessions', 'INSERT');
    v_auth_attempts_sel := has_table_privilege('authenticated', 'public.admin_login_attempts', 'SELECT');
    v_auth_attempts_ins := has_table_privilege('authenticated', 'public.admin_login_attempts', 'INSERT');
    v_auth_rpc_exec     := has_function_privilege('authenticated', 'public.check_and_record_login_attempt(text,int,int)', 'EXECUTE');

    -- Role 'service_role'
    v_sr_sessions_sel   := has_table_privilege('service_role', 'public.admin_sessions', 'SELECT');
    v_sr_sessions_ins   := has_table_privilege('service_role', 'public.admin_sessions', 'INSERT');
    v_sr_sessions_upd   := has_table_privilege('service_role', 'public.admin_sessions', 'UPDATE');
    v_sr_attempts_sel   := has_table_privilege('service_role', 'public.admin_login_attempts', 'SELECT');
    v_sr_attempts_ins   := has_table_privilege('service_role', 'public.admin_login_attempts', 'INSERT');
    v_sr_attempts_del   := has_table_privilege('service_role', 'public.admin_login_attempts', 'DELETE');
    v_sr_rpc_exec       := has_function_privilege('service_role', 'public.check_and_record_login_attempt(text,int,int)', 'EXECUTE');

    RAISE NOTICE 'VERIFICAÇÃO DE PRIVILÉGIOS DE SEGURANÇA:';
    RAISE NOTICE '  - anon: SELECT sessions = %, INSERT sessions = %, EXECUTE rpc = %',
        v_anon_sessions_sel, v_anon_sessions_ins, v_anon_rpc_exec;
    RAISE NOTICE '  - authenticated: SELECT sessions = %, INSERT sessions = %, EXECUTE rpc = %',
        v_auth_sessions_sel, v_auth_sessions_ins, v_auth_rpc_exec;
    RAISE NOTICE '  - service_role: SELECT sessions = %, INSERT sessions = %, UPDATE sessions = %, EXECUTE rpc = %',
        v_sr_sessions_sel, v_sr_sessions_ins, v_sr_sessions_upd, v_sr_rpc_exec;

    IF v_anon_sessions_sel OR v_anon_sessions_ins OR v_anon_attempts_sel OR v_anon_attempts_ins OR v_anon_rpc_exec THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Role anon possui permissões indevidas!';
    END IF;

    IF v_auth_sessions_sel OR v_auth_sessions_ins OR v_auth_attempts_sel OR v_auth_attempts_ins OR v_auth_rpc_exec THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Role authenticated possui permissões indevidas!';
    END IF;

    IF NOT (v_sr_sessions_sel AND v_sr_sessions_ins AND v_sr_sessions_upd AND v_sr_attempts_sel AND v_sr_attempts_ins AND v_sr_attempts_del AND v_sr_rpc_exec) THEN
        RAISE EXCEPTION 'FALHA DE CONFIGURAÇÃO: Role service_role não possui os privilégios necessários!';
    END IF;

    RAISE NOTICE '✔ SUCESSO: Permissões verificadas! Roles anon e authenticated totalmente bloqueadas; service_role autorizada.';
    RAISE NOTICE '----------------------------------------------------------------------';
    RAISE NOTICE 'FINALIZANDO VALIDAÇÃO COM ROLLBACK TRANSACIONAL (Nenhum objeto ou dado será mantido no banco)';
    RAISE NOTICE '----------------------------------------------------------------------';
END;
$$;

-- ==============================================================================
-- PARTE 3: ROLLBACK INCONDICIONAL (DESFAZ 100% DAS ALTERAÇÕES DO TESTE)
-- ==============================================================================
ROLLBACK;
