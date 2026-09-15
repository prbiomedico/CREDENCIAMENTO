import React, { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { text: 'Produto', href: '/#produto' },
  { text: 'Segurança', href: '/#seguranca' },
  { text: 'Cobertura nacional', href: '/transparencia' },
  { text: 'Contato', href: '/planos' },
];

function Brand() {
  return <a href="/" aria-label="SIGCR — início"><BrandLogo variant="horizontal" className="h-10 w-auto sm:h-11" alt="SIGCR" /></a>;
}

export default function PublicHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] border-b border-slate-200/90 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
            {LINKS.map((link) => <a key={link.href} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-slate-950">{link.text}</a>)}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <a href="/transparencia" className="text-sm font-medium text-slate-600 transition hover:text-slate-950">Consulta pública</a>
            <Button asChild><a href="/login">Acessar o SIGCR <ArrowRight className="h-4 w-4" /></a></Button>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700 lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="h-16" aria-hidden="true" />

      <div className={cn('fixed inset-0 z-[70] lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
        <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className={cn('absolute inset-0 bg-slate-950/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')} />
        <aside className={cn('absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col bg-white p-6 shadow-2xl transition-transform', open ? 'translate-x-0' : 'translate-x-full')}>
          <div className="flex items-center justify-between"><Brand /><button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200" aria-label="Fechar menu"><X className="h-4 w-4" /></button></div>
          <nav className="mt-10 flex flex-col gap-1" aria-label="Navegação principal móvel">
            {LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">{link.text}</a>)}
            <a href="/transparencia" onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Consulta pública</a>
          </nav>
          <Button asChild className="mt-auto w-full"><a href="/login">Acessar o SIGCR <ArrowRight className="h-4 w-4" /></a></Button>
        </aside>
      </div>
    </>
  );
}
