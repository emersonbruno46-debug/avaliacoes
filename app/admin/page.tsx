'use client';

import { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsRateLimited(false);

    if (!password) {
      setErrorMsg('Informe a senha de administração.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }), // Envia a senha exatamente como digitada (sem trim)
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const redirectParam = urlParams.get('redirect');
          if (redirectParam) {
            window.location.href = redirectParam;
          } else if (
            window.location.pathname !== '/admin' &&
            window.location.pathname !== '/login'
          ) {
            window.location.reload();
          } else {
            window.location.href = '/';
          }
        }
      } else {
        if (res.status === 429) {
          setIsRateLimited(true);
        }
        setErrorMsg(data.error || 'Falha na autenticação. Verifique os dados informados.');
      }
    } catch {
      setErrorMsg('Erro de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-gray-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-blue-100">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Painel Administrativo
          </h1>
          <p className="text-xs text-gray-500">
            Acesso restrito para gerenciamento de placas físicas e QR Codes.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              Senha de Acesso
            </label>
            <input
              type="password"
              placeholder="Digite a senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-base font-mono"
              required
              autoFocus
            />
          </div>

          {errorMsg && (
            <div
              className={`p-3 border text-xs rounded-xl flex items-center gap-2 ${
                isRateLimited
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {isRateLimited ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              )}
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all text-base flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span>Autenticando...</span>
            ) : (
              <>
                <span>ENTRAR</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
          Sistema de Placas de Avaliação Google
        </div>
      </div>
    </main>
  );
}
