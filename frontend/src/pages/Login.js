import React from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] hero-glow rounded-full blur-3xl"></div>
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/10 mb-4 glow-orange">
              <Shield className="h-8 w-8 text-primary-500" />
            </div>
            <h1 className="text-3xl font-heading font-bold tracking-tight mb-2">SIGCR</h1>
            <p className="text-zinc-400">Sistema Integrado de Gestão de Credenciamento</p>
          </div>
          <Button
            onClick={login}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium tracking-wide button-shadow h-12"
          >
            Entrar
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
