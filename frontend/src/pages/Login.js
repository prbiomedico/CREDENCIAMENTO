import React, { useState } from 'react';
import { ArrowRight, BadgeCheck, Building2, Landmark, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const { login } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const handleLogin = () => { setRedirecting(true); login(); };

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-12 py-10 text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.08)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5"><ShieldCheck className="h-6 w-6 text-sky-300" /></span><div><strong className="block text-lg tracking-tight">SIGCR</strong><span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Ambiente institucional</span></div></div>
          <div className="relative my-auto max-w-2xl py-14">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-sky-300">Governança nacional</p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em]">Credenciamento com contexto, controle e rastreabilidade.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Um ambiente único para DETRANs, registradoras e instituições financeiras conduzirem processos regulatórios com segurança.</p>
            <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">{[['DETRANs', Landmark], ['Registradoras', Building2], ['Acesso auditável', BadgeCheck]].map(([label, Icon]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"><Icon className="mb-7 h-5 w-5 text-sky-300" /><p className="text-sm font-medium text-slate-200">{label}</p></div>)}</div>
          </div>
          <p className="relative text-xs text-slate-500">SIGCR · Sistema Integrado de Gestão de Credenciamento</p>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-12 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span><div><strong className="block text-base text-slate-950">SIGCR</strong><span className="text-xs text-slate-500">Ambiente institucional</span></div></div>
            <div className="mb-8"><span className="mb-6 grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-slate-50"><LockKeyhole className="h-5 w-5 text-slate-700" /></span><p className="text-sm font-semibold text-sky-700">Acesso seguro</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Entre no ambiente SIGCR</h2><p className="mt-3 text-base leading-7 text-slate-600">Use sua identidade institucional. Você será direcionado ao provedor seguro para concluir a autenticação.</p></div>
            <Button onClick={handleLogin} disabled={redirecting} className="h-12 w-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-950/10 hover:bg-slate-800">{redirecting ? 'Redirecionando com segurança...' : <>Continuar para autenticação <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-sm leading-6 text-slate-600"><strong className="font-semibold text-slate-800">Sessão protegida.</strong> O acesso respeita perfil, UF, permissões e trilha de auditoria.</p></div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500"><span>© 2026 SIGCR</span><a href="/transparencia" className="font-medium text-slate-700 hover:text-slate-950">Acessar transparência pública</a></div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Login;
