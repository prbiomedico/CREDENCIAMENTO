import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Calendar, Eye, FileSearch,
  LockKeyhole, LogIn, Mail, MapPin, Paperclip, Search, ShieldCheck,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const REGIOES = [
  { nome: 'Norte', ufs: ['AC','AP','AM','PA','RO','RR','TO'] },
  { nome: 'Nordeste', ufs: ['AL','BA','CE','MA','PB','PE','PI','RN','SE'] },
  { nome: 'Centro-Oeste', ufs: ['DF','GO','MT','MS'] },
  { nome: 'Sudeste', ufs: ['ES','MG','RJ','SP'] },
  { nome: 'Sul', ufs: ['PR','RS','SC'] },
];

const dataBr = (valor) => {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
};

export default function Transparencia() {
  const { uf } = useParams();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');

  useEffect(() => {
    setBusca('');
    setTipo('todos');
    if (!uf) { setDados(null); return; }
    setLoading(true);
    setErro(null);
    axios.get(`${API}/public/atos-credenciamento/${uf}`)
      .then((res) => setDados(res.data))
      .catch(() => setErro('Não foi possível carregar os atos deste estado.'))
      .finally(() => setLoading(false));
  }, [uf]);

  const atos = useMemo(() => (dados?.atos || []).filter((ato) => {
    const texto = `${ato.titulo || ''} ${ato.numero || ''} ${ato.orgao_emissor || ''}`.toLowerCase();
    return (tipo === 'todos' || ato.tipo_documento?.toLowerCase() === tipo) && texto.includes(busca.toLowerCase());
  }), [dados, busca, tipo]);

  const totalDocumentos = (dados?.atos || []).reduce((total, ato) => total + (ato.documentos?.length || 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <button className="flex items-center gap-3" onClick={() => navigate('/')} aria-label="Voltar ao início">
            <BrandLogo variant="horizontal" className="h-10 w-auto" alt="SIGCR" />
            <span className="hidden border-l border-border pl-3 text-xs font-semibold text-muted-foreground sm:block">Consulta pública</span>
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/planos')}><Mail className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Fale conosco</span></Button>
            <Button size="sm" onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" /> Entrar</Button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-border bg-[hsl(var(--sigcr-sidebar))] text-white">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_35%,rgba(197,155,39,0.22),transparent_58%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-[#d5ad3f]" /> Fonte pública organizada e acesso protegido
          </div>
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">Portarias e Editais de Credenciamento</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Descubra oportunidades regulatórias por estado, entenda as exigências e acompanhe atos oficiais em uma experiência clara e centralizada.
          </p>
          <div className="mt-8 flex max-w-xl flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-2 sm:flex-row">
            <Select value={uf || ''} onValueChange={(valor) => navigate(`/transparencia/${valor}`)}>
              <SelectTrigger className="h-11 flex-1 border-white/15 bg-white text-slate-900"><MapPin className="mr-2 h-4 w-4 text-accent" /><SelectValue placeholder="Selecione um estado" /></SelectTrigger>
              <SelectContent>{UFS.map((sigla) => <SelectItem key={sigla} value={sigla}>{sigla}</SelectItem>)}</SelectContent>
            </Select>
            {uf && <Button className="h-11 bg-[#c59b27] text-slate-950 hover:bg-[#d5ad3f]" onClick={() => document.getElementById('resultados')?.scrollIntoView({ behavior: 'smooth' })}>Ver oportunidades <ArrowRight className="ml-2 h-4 w-4" /></Button>}
          </div>
        </div>
      </section>

      <main id="resultados" className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        {!uf && (
          <div>
            <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Cobertura nacional</p><h2 className="mt-2 text-2xl font-bold">Comece pelo estado de interesse</h2></div>
              <p className="max-w-md text-sm text-muted-foreground">Selecione uma UF para consultar atos vigentes, documentos exigidos e prévias públicas.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {REGIOES.map((regiao) => (
                <Card key={regiao.nome} className="border-border bg-card transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
                  <CardContent className="p-5"><p className="mb-4 font-bold">{regiao.nome}</p><div className="flex flex-wrap gap-2">{regiao.ufs.map((sigla) => <button key={sigla} onClick={() => navigate(`/transparencia/${sigla}`)} className="rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-xs font-bold transition hover:border-accent hover:bg-accent/10">{sigla}</button>)}</div></CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[['Acervo unificado','Portarias, editais, termos e anexos contextualizados.'],['Prévia segura','Somente a primeira página, sem download público.'],['Jornada integrada','Do ato publicado à gestão completa do credenciamento.']].map(([titulo, texto]) => (
                <div key={titulo} className="border-l-2 border-accent px-4"><p className="font-semibold">{titulo}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{texto}</p></div>
              ))}
            </div>
          </div>
        )}

        {uf && loading && <div className="flex items-center justify-center gap-3 py-20 text-sm text-muted-foreground"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Consultando atos oficiais…</div>}
        {uf && !loading && erro && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-8 text-center text-destructive">{erro}</CardContent></Card>}

        {uf && !loading && !erro && dados && (
          <>
            <div className="mb-7 grid gap-3 sm:grid-cols-3">
              <Card><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado consultado</p><p className="mt-2 text-xl font-bold">{dados.uf_nome} · {dados.uf}</p></CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atos disponíveis</p><p className="mt-2 text-xl font-bold">{dados.atos.length}</p></CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prévias documentais</p><p className="mt-2 text-xl font-bold">{totalDocumentos}</p></CardContent></Card>
            </div>

            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row">
              <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, número ou órgão" className="pl-9" /></div>
              <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os atos</SelectItem><SelectItem value="portaria">Portarias</SelectItem><SelectItem value="edital">Editais</SelectItem></SelectContent></Select>
            </div>

            {atos.length === 0 ? (
              <Card><CardContent className="p-12 text-center"><FileSearch className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">Nenhum ato encontrado</p><p className="mt-1 text-sm text-muted-foreground">Revise a busca ou consulte outro estado.</p></CardContent></Card>
            ) : (
              <div className="space-y-4">
                {atos.map((ato) => (
                  <Card key={`${ato.origem_registro}-${ato.ato_id}`} className="overflow-hidden border-border bg-card transition hover:border-accent/35 hover:shadow-md">
                    <CardContent className="p-0">
                      <div className="h-1 bg-gradient-to-r from-accent via-accent/45 to-transparent" />
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="max-w-3xl">
                            <div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-accent/30 bg-accent/10 text-foreground">{ato.tipo_documento}</Badge>{ato.numero && <span className="font-mono text-xs text-muted-foreground">Nº {ato.numero}</span>}<Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Vigente</Badge></div>
                            <h3 className="text-lg font-bold sm:text-xl">{ato.titulo}</h3>
                            {ato.descricao && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{ato.descricao}</p>}
                          </div>
                          <div className="shrink-0 rounded-lg bg-secondary/60 px-4 py-3 text-xs text-muted-foreground"><p className="font-semibold text-foreground">{ato.orgao_emissor || `DETRAN-${dados.uf}`}</p>{dataBr(ato.data_publicacao) && <p className="mt-1">Publicado em {dataBr(ato.data_publicacao)}</p>}</div>
                        </div>

                        {ato.data_encerramento && <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-800"><Calendar className="h-4 w-4" /> Prazo até {dataBr(ato.data_encerramento)}</div>}
                        {ato.documentos_obrigatorios?.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Principais exigências</p><div className="flex flex-wrap gap-1.5">{ato.documentos_obrigatorios.map((documento) => <Badge key={documento} variant="secondary" className="font-normal">{documento}</Badge>)}</div></div>}

                        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
                          {ato.documentos?.map((documento) => <Button key={`${documento.categoria}-${documento.nome}`} size="sm" variant="outline" onClick={() => setPreview({ nome: documento.nome, url: `${BACKEND_URL}${documento.preview_url}` })}>{documento.categoria === 'portaria' ? <Eye className="mr-2 h-3.5 w-3.5" /> : <Paperclip className="mr-2 h-3.5 w-3.5" />}Prévia: {documento.nome}</Button>)}
                          {ato.documentos?.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma prévia publicada.</span>}
                        </div>

                        <div className="mt-5 flex flex-col gap-4 rounded-lg border border-border bg-secondary/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><div><p className="text-sm font-semibold">Documento integral protegido</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">A prévia pública exibe somente a primeira página. O conteúdo integral exige uma conta habilitada.</p></div></div>
                          <div className="flex shrink-0 gap-2">{ato.cadastro_url && <Button size="sm" variant="outline" onClick={() => navigate(ato.cadastro_url)}>Iniciar cadastro</Button>}<Button size="sm" onClick={() => navigate('/login')}><LogIn className="mr-2 h-3.5 w-3.5" />Entrar</Button></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        <section className="mt-14 overflow-hidden rounded-xl bg-[hsl(var(--sigcr-sidebar))] px-6 py-8 text-white sm:px-9 sm:py-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d5ad3f]"><BadgeCheck className="h-4 w-4" />Além da consulta</div><h2 className="text-2xl font-bold">Transforme exigências regulatórias em uma operação previsível.</h2><p className="mt-3 text-sm leading-6 text-slate-300">O SIGCR conecta documentos, prazos, equipes, segurança e acompanhamento em uma única jornada de credenciamento.</p></div>
            <Button className="shrink-0 bg-[#c59b27] text-slate-950 hover:bg-[#d5ad3f]" onClick={() => navigate('/planos')}>Falar com especialista <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </section>

        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mt-8 text-muted-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao início</Button>
      </main>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4"><DialogTitle>{preview?.nome}</DialogTitle><DialogDescription>Prévia pública protegida — somente a primeira página é exibida.</DialogDescription></DialogHeader>
          <div className="relative max-h-[68vh] overflow-auto bg-slate-100 p-4 sm:p-6">{preview && <img src={preview.url} alt={`Primeira página de ${preview.nome}`} draggable="false" className="mx-auto w-full max-w-3xl select-none border border-slate-200 bg-white shadow-lg" />}<div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-100 to-transparent" /></div>
          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">A versão integral não é transmitida nesta consulta pública.</p><div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/login')}>Entrar</Button><Button onClick={() => navigate('/planos')}>Falar com especialista</Button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
