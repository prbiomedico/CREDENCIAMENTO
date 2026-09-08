import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronDown, FileCheck2, FileText, Menu, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const STATUS_STYLES = {
  vigente: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  analise: 'border-amber-200 bg-amber-50 text-amber-900',
  publicado: 'border-sky-200 bg-sky-50 text-sky-800',
  encerrado: 'border-zinc-200 bg-zinc-100 text-zinc-700',
};
const PREVIEW_TABS = ['Portarias', 'Credenciamentos', 'Documentos'];

function Brand() {
  return <a href="/" className="flex items-center gap-2.5" aria-label="SIGCR — início"><span className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span><span><strong className="block text-base leading-none tracking-tight text-slate-950">SIGCR</strong><span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Gestão de credenciamento</span></span></a>;
}

function Navbar({ links, onLogin }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  return <>
    <header className="relative z-40 border-b border-slate-200/80 bg-white/95"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8"><Brand /><nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">{links.map((link) => <a key={link.href} href={link.href} className="text-sm font-medium text-slate-600 hover:text-slate-950">{link.text}</a>)}</nav><div className="hidden items-center gap-3 lg:flex"><a href="/transparencia" className="text-sm font-medium text-slate-600 hover:text-slate-950">Consulta pública</a><Button onClick={onLogin}>Acessar o SIGCR <ArrowRight className="h-4 w-4" /></Button></div><button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700 lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button></div></header>
    <div className={cn('fixed inset-0 z-50 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}><button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className={cn('absolute inset-0 bg-slate-950/35 transition-opacity', open ? 'opacity-100' : 'opacity-0')} /><aside className={cn('absolute right-0 top-0 flex h-full w-[min(88vw,360px)] flex-col bg-white p-6 shadow-2xl transition-transform', open ? 'translate-x-0' : 'translate-x-full')}><div className="flex items-center justify-between"><Brand /><button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200" aria-label="Fechar menu"><X className="h-4 w-4" /></button></div><nav className="mt-10 flex flex-col gap-1">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">{link.text}</a>)}<a href="/transparencia" className="rounded-md px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Consulta pública</a></nav><Button onClick={onLogin} className="mt-auto w-full">Acessar o SIGCR <ArrowRight className="h-4 w-4" /></Button></aside></div>
  </>;
}

function Status({ tone, children }) {
  return <span className={cn('inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[tone] || STATUS_STYLES.encerrado)}>{children}</span>;
}

function ProductPreview({ rows }) {
  const [tab, setTab] = useState('Portarias');
  return <div className="relative mx-auto mt-14 max-w-6xl px-4 sm:px-8"><div className="absolute -inset-x-8 bottom-0 top-20 -z-10 rounded-[2rem] bg-slate-200/45 blur-2xl" /><div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_24px_70px_-35px_rgba(15,23,42,0.45)]">
    <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Prévia do produto">{PREVIEW_TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={cn('whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold', tab === item ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}>{item}</button>)}</div><div className="flex gap-2"><Button variant="outline" size="sm"><Upload /> Importar</Button><Button size="sm"><FileText /> Nova portaria</Button></div></div>
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input readOnly placeholder="Buscar por número, órgão ou UF" className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none" /></div><div className="flex gap-2"><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">Status <ChevronDown className="h-3.5 w-3.5" /></button><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">UF <ChevronDown className="h-3.5 w-3.5" /></button></div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white text-xs font-medium text-slate-500"><tr><th className="px-6 py-3">Portaria</th><th className="px-4 py-3">Órgão / UF</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Publicação</th><th className="px-6 py-3 text-right">Ação</th></tr></thead><tbody>{rows.map((row) => <tr key={row.number} className="border-t border-slate-200 hover:bg-slate-50"><td className="px-6 py-4"><div className="font-mono text-xs font-semibold text-slate-900">{row.number}</div><div className="mt-1 text-xs text-slate-500">{row.title}</div></td><td className="px-4 py-4"><div className="font-medium text-slate-800">{row.agency}</div><div className="text-xs text-slate-500">{row.uf}</div></td><td className="px-4 py-4"><Status tone={row.tone}>{row.status}</Status></td><td className="px-4 py-4 font-mono text-xs text-slate-600">{row.date}</td><td className="px-6 py-4 text-right"><button type="button" className="text-xs font-semibold text-sky-700 hover:text-sky-900">Ver detalhes</button></td></tr>)}</tbody></table></div>
    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-6 py-3 text-xs text-slate-500"><span>Exibindo 4 de 128 registros</span><span className="font-mono">Dados demonstrativos</span></div>
  </div></div>;
}

function Capability({ icon: Icon, title, description }) {
  return <article className="border-t border-slate-300 pt-5"><Icon className="h-5 w-5 text-slate-950" /><h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>;
}

export function HeroSection({ data, onLogin }) {
  return <div className="min-h-screen bg-[#f7f8fa] text-slate-950"><Navbar links={data.navLinks} onLogin={onLogin} /><main>
    <section className="relative overflow-hidden border-b border-slate-200 pb-20 pt-16 sm:pt-24"><div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(to_right,#dfe3e8_1px,transparent_1px),linear-gradient(to_bottom,#dfe3e8_1px,transparent_1px)] [background-size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" /><div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8"><div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Infraestrutura nacional de credenciamento</div><h1 className="mx-auto mt-7 max-w-4xl font-heading text-5xl font-semibold leading-[0.98] tracking-[-0.035em] text-slate-950 sm:text-6xl lg:text-7xl">Credenciamento regulatório, sem perder o controle.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Centralize portarias, editais, empresas e documentos em uma operação auditável — da descoberta no Diário Oficial à decisão do órgão responsável.</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><Button size="lg" onClick={onLogin} className="h-11 px-6">Acessar plataforma <ArrowRight /></Button><Button size="lg" variant="outline" className="h-11 px-6" onClick={() => document.getElementById('produto')?.scrollIntoView({ behavior: 'smooth' })}>Conhecer o fluxo</Button></div><div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">{['Perfis e permissões', 'Histórico auditável', 'Cobertura nacional'].map((item) => <span key={item} className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{item}</span>)}</div></div><ProductPreview rows={data.previewRows} /></section>
    <section id="produto" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24"><div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Uma operação, três perspectivas</p><h2 className="mt-4 font-heading text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">Todos trabalham sobre o mesmo processo.</h2><p className="mt-5 max-w-lg text-base leading-7 text-slate-600">Registradoras, financeiras e DETRANs acessam somente o que precisam, mantendo contexto, documentos e decisões conectados.</p></div><div className="grid gap-8 sm:grid-cols-2">{data.capabilities.map((item) => <Capability key={item.title} {...item} />)}</div></div></section>
    <section id="seguranca" className="bg-slate-950 px-5 py-20 text-white sm:px-8"><div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Governança por desenho</p><h2 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Clareza operacional para decisões que precisam deixar rastro.</h2><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">Escopo efetivo, visão ativa, permissões e estados são explícitos em cada etapa. Menos ambiguidade para quem envia, confere e decide.</p></div><Button onClick={onLogin} size="lg" className="bg-white text-slate-950 hover:bg-slate-100">Entrar no SIGCR <ArrowRight /></Button></div></section>
  </main><footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand /><p>© 2026 SIGCR — Sistema Integrado de Gestão de Credenciamento de Registradoras</p></div></footer></div>;
}

export const heroIcons = { Building2, CalendarDays, FileCheck2, FileText };
export default HeroSection;
