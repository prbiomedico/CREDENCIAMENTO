import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, FileCheck, Shield, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Landing = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-orange-500" />
            <span className="text-2xl font-heading font-bold tracking-tight">SIGCR</span>
          </div>
          <Button
            data-testid="login-btn"
            onClick={handleLogin}
            className="bg-orange-500 hover:bg-orange-600 text-white font-medium tracking-wide button-shadow"
          >
            Entrar
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-30"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] hero-glow rounded-full blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl">
            <div className="inline-block mb-6 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full">
              <span className="text-sm font-mono text-orange-500 uppercase tracking-widest">Sistema Oficial</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-heading font-bold tracking-tighter uppercase mb-6">
              <span className="text-highlight">Credenciamento</span>
              <br />
              <span className="text-white">Simplificado</span>
            </h1>
            
            <p className="text-lg md:text-xl text-zinc-400 leading-relaxed mb-8 max-w-2xl">
              Sistema Integrado de Gestão de Credenciamento de Registradoras.
              Busque portarias nos Diários Oficiais, gerencie empresas e acompanhe
              todo o processo de credenciamento em um só lugar.
            </p>
            
            <div className="flex gap-4">
              <Button
                data-testid="get-started-btn"
                onClick={handleLogin}
                size="lg"
                className="bg-orange-500 hover:bg-orange-600 text-white font-medium tracking-wide button-shadow h-12 px-8"
              >
                Começar Agora
              </Button>
              <Button
                data-testid="learn-more-btn"
                onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
                size="lg"
                variant="outline"
                className="bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700 h-12 px-8"
              >
                Saiba Mais
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-mono text-orange-500 uppercase tracking-widest">Recursos</span>
            <h2 className="text-4xl md:text-5xl font-heading font-bold tracking-tight mt-4 mb-4">
              Tudo que você precisa
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Ferramentas completas para gestão de credenciamento de registradoras de contratos
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Search,
                title: 'Busca de Portarias',
                description: 'Encontre portarias nos Diários Oficiais com análise inteligente por IA'
              },
              {
                icon: Building2,
                title: 'Gestão de Empresas',
                description: 'Cadastre e acompanhe empresas registradoras em todo o processo'
              },
              {
                icon: FileCheck,
                title: 'Validação de Documentos',
                description: 'Upload e validação de todos os documentos necessários para credenciamento'
              },
              {
                icon: TrendingUp,
                title: 'Dashboard Completo',
                description: 'Acompanhe estatísticas e status de credenciamento em tempo real'
              }
            ].map((feature, idx) => (
              <div
                key={idx}
                data-testid={`feature-card-${idx}`}
                className="bg-zinc-950/50 backdrop-blur-sm border border-zinc-800/60 rounded-lg p-6 hover:border-orange-500/30 card-hover group"
              >
                <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center bg-zinc-900 border border-zinc-800 rounded-2xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 hero-glow opacity-50"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-heading font-bold tracking-tight mb-6">
              Pronto para começar?
            </h2>
            <p className="text-zinc-400 text-lg mb-8">
              Entre agora e gerencie o credenciamento de forma eficiente
            </p>
            <Button
              data-testid="cta-login-btn"
              onClick={handleLogin}
              size="lg"
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium tracking-wide button-shadow h-14 px-12 text-lg"
            >
              Acessar Sistema
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6">
        <div className="max-w-7xl mx-auto text-center text-zinc-500 text-sm">
          <p>© 2026 SIGCR - Sistema Integrado de Gestão de Credenciamento de Registradoras</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;