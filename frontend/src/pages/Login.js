import React from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Login = () => {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] hero-glow rounded-full blur-3xl"></div>
      
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 mb-4 glow-orange">
              <Shield className="h-8 w-8 text-orange-500" />
            </div>
            <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">SIGCR</h1>
            <p className="text-zinc-400">Sistema Integrado de Gestão de Credenciamento</p>
          </div>

          <Button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium tracking-wide button-shadow h-12"
          >
            Entrar com Google
          </Button>

          <p className="text-xs text-zinc-500 text-center mt-6">
            Ao continuar, você concorda com os termos de uso
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;