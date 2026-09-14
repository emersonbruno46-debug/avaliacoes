/**
 * SCRIPT DE TESTE DE CONCORRÊNCIA E PERMISSÕES EM BANCO ISOLADO (STAGING/TESTES)
 *
 * ATENÇÃO: NÃO EXECUTAR CONTRA O BANCO DE PRODUÇÃO!
 * Este script deve ser executado apenas apontando para um banco de testes isolado contendo
 * a migration 'supabase/migration_admin_auth.sql' aplicada.
 *
 * Para rodar:
 *   TEST_SUPABASE_URL=https://seu-banco-teste.supabase.co \
 *   TEST_SERVICE_ROLE_KEY=sua-chave-service-role-teste \
 *   node scripts/test-db-concurrency.mjs
 */

import { createClient } from '@supabase/supabase-js';

const testUrl = process.env.TEST_SUPABASE_URL;
const testKey = process.env.TEST_SERVICE_ROLE_KEY;

if (!testUrl || !testKey) {
  console.log('Ambiente de banco isolado não configurado (TEST_SUPABASE_URL e TEST_SERVICE_ROLE_KEY ausentes).');
  console.log('Teste de concorrência em banco real marcado como PENDENTE de ambiente isolado de testes.');
  process.exit(0);
}

const supabaseAdmin = createClient(testUrl, testKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runConcurrencyTest() {
  console.log('Iniciando teste de concorrência atômica com 10 chamadas simultâneas...');
  const testIp = '198.51.100.99';

  // Limpar histórico anterior do IP de teste
  await supabaseAdmin.from('admin_login_attempts').delete().eq('ip_address', testIp);

  // Executar 10 chamadas concorrentes paralelas à RPC atômica p_max_attempts=5
  const promises = Array.from({ length: 10 }).map(() =>
    supabaseAdmin.rpc('check_and_record_login_attempt', {
      p_ip: testIp,
      p_max_attempts: 5,
      p_window_minutes: 15,
    })
  );

  const results = await Promise.all(promises);

  let allowedCount = 0;
  let blockedCount = 0;

  results.forEach((res) => {
    if (res.data?.allowed === true) allowedCount++;
    if (res.data?.allowed === false) blockedCount++;
  });

  console.log(`Resultado do teste de concorrência: ${allowedCount} permitidas, ${blockedCount} bloqueadas.`);

  if (allowedCount === 5 && blockedCount === 5) {
    console.log('✔ SUCESSO: A Stored Procedure atômica serializou perfeitamente 10 requisições simultâneas!');
  } else {
    console.error(`✖ ERRO: Esperado exatamente 5 permitidas e 5 bloqueadas. Obtido ${allowedCount}/${blockedCount}`);
  }
}

runConcurrencyTest().catch(console.error);
