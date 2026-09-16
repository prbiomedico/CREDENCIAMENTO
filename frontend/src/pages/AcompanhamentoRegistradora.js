import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, ClipboardList, ExternalLink } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import ProcessoSeiTab from '../components/ProcessoSeiTab';
import { useAuth } from '../contexts/AuthContext';
import { useViewContext } from '../contexts/ViewContext';
import { usePerfilAtivo } from '../contexts/PerfilAtivoContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ETAPAS_ESTEIRA, STATUS_ETAPA, montarProcessos } from '../lib/acompanhamento';
const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground';
const dataFormatada = value => {
  if (!value) return 'Não informada';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Não informada' : date.toLocaleDateString('pt-BR');
};

export default function AcompanhamentoRegistradora() {
  const { user, initialized, isAdmin } = useAuth();
  const { viewingAs } = useViewContext();
  const { perfilAtivo } = usePerfilAtivo();
  const [empresas, setEmpresas] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [selecionado, setSelecionado] = useState(null);
  const contexto = `${user?.user_id}:${viewingAs?.tipo || ''}:${viewingAs?.id || ''}:${perfilAtivo}`;
  const disponivel = perfilAtivo === 'registradora' && viewingAs?.tipo !== 'detran';

  useEffect(() => {
    const controller = new AbortController();
    setEmpresas([]); setCompanyId(''); setResultado(null); setSelecionado(null); setErro(''); setCarregandoEmpresas(true);
    if (!initialized || !user || !disponivel) { setCarregandoEmpresas(false); return () => controller.abort(); }
    const params = { tipo_empresa: 'registradora', ...(isAdmin && viewingAs?.tipo === 'empresa' ? { view_as_company_id: viewingAs.id } : {}) };
    axios.get(`${API}/companies`, { params, withCredentials: true, signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data)) throw new Error('Resposta inválida');
      const lista = viewingAs?.tipo === 'empresa' ? data.filter(e => e.company_id === viewingAs.id) : data;
      setEmpresas(lista); setCompanyId(lista.length === 1 ? lista[0].company_id : '');
    }).catch(e => { if (!controller.signal.aborted) setErro('Não foi possível carregar as empresas. Tente atualizar.'); })
      .finally(() => { if (!controller.signal.aborted) setCarregandoEmpresas(false); });
    return () => controller.abort();
  }, [contexto, initialized, disponivel, isAdmin, versao]); // contexto inclui usuário e modo ver como

  useEffect(() => {
    const controller = new AbortController();
    setResultado(null); setSelecionado(null);
    if (!companyId || !disponivel) return () => controller.abort();
    setErro('');
    const params = isAdmin ? { view_as_company_id: companyId } : {};
    Promise.all(['esteiras', 'submissoes'].map(path => axios.get(`${API}/${path}`, { params, withCredentials: true, signal: controller.signal }))).then(([esteiras, submissoes]) => {
      if (!Array.isArray(esteiras.data) || !Array.isArray(submissoes.data)) throw new Error('Resposta inválida');
      setResultado({ companyId, contexto, esteiras: esteiras.data, submissoes: submissoes.data });
    }).catch(e => { if (!controller.signal.aborted) setErro('Não foi possível carregar todos os andamentos. Atualize para conferir as pendências.'); });
    return () => controller.abort();
  }, [companyId, contexto, disponivel, isAdmin]);

  const empresa = empresas.find(e => e.company_id === companyId);
  const pronto = resultado?.companyId === companyId && resultado?.contexto === contexto;
  const processos = useMemo(() => pronto ? montarProcessos(empresa, resultado.esteiras, resultado.submissoes) : [], [pronto, empresa, resultado]);
  const pendencias = processos.flatMap(p => p.pendencias.map(item => ({ ...item, processo: p })));
  const linhas = processos.filter(p => `${p.uf} ${p.numero} ${p.etapa}`.toLowerCase().includes(busca.toLowerCase()) && (filtro === 'todos' || (filtro === 'pendencias' ? p.pendencias.length > 0 : filtro === 'concluidos' ? p.concluido : !p.concluido)));
  const detalhe = processos.find(p => p.id === selecionado);

  return <DashboardLayout><div className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><h1 className="text-2xl font-bold text-foreground">Acompanhamento</h1><p className="mt-1 text-sm text-muted-foreground">Credenciamentos por DETRAN e próximas ações da registradora.</p></div>
      <Button variant="outline" onClick={() => setVersao(v => v + 1)}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
    </header>
    {!disponivel ? <p className="rounded-lg border border-border p-5">Selecione o perfil Registradora para acompanhar uma empresa.</p> : <>
      <div className="space-y-2"><Label className="block" htmlFor="companhia-acompanhamento">Empresa acompanhada</Label>
        <select id="companhia-acompanhamento" className={`${selectClass} w-full sm:max-w-md`} value={companyId} disabled={carregandoEmpresas} onChange={e => setCompanyId(e.target.value)}>
          <option value="">{carregandoEmpresas ? 'Carregando empresas...' : 'Selecione a empresa'}</option>
          {empresas.map(e => <option value={e.company_id} key={e.company_id}>{e.nome_fantasia || e.name}</option>)}
        </select></div>
      {erro ? <div role="alert" className="rounded-lg border border-destructive/40 bg-card p-4 text-sm">{erro}</div> : carregandoEmpresas || (companyId && !pronto) ? <p role="status" className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando acompanhamento...</p> : !companyId ? <p className="rounded-lg border border-border p-5 text-muted-foreground">{empresas.length ? 'Selecione uma empresa para visualizar seus processos e pendências.' : 'Nenhuma registradora disponível para este acesso.'}</p> : <>
        <dl className="grid divide-y divide-border rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[[processos.length, 'Processos acompanhados'], [pendencias.length, 'Ações da empresa'], [processos.filter(p => p.aguardandoOrgao).length, 'Aguardando análise no SIGCR']].map(([n,label]) => <div key={label} className="p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{n}</dd></div>)}
        </dl>
        <section className="space-y-3" aria-label="Pendências da empresa"><h2 className="text-lg font-semibold">Pendências da empresa</h2>
          {!pendencias.length ? <div className="rounded-lg border border-border bg-card p-4"><p className="text-sm font-medium">Nenhuma ação da empresa registrada no fluxo digital.</p><p className="mt-1 text-sm text-muted-foreground">Para processos SEI, confira as notificações no acesso externo. Uma movimentação interna do órgão não cria uma pendência da empresa aqui.</p></div> : <ul className="divide-y divide-border rounded-lg border border-border bg-card">{pendencias.map(item => <li key={`${item.processo.id}-${item.id}`} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold">DETRAN-{item.processo.uf} · {item.titulo}</p><p className="mt-1 break-words text-sm text-muted-foreground">{item.descricao}</p><p className="mt-1 text-xs text-muted-foreground">Prazo: {item.prazo ? dataFormatada(item.prazo) : 'Não informado'} · Fonte: checklist e fluxo do SIGCR</p></div><Button asChild variant="outline" className="shrink-0"><Link to={item.processo.href}>Resolver pendência</Link></Button></li>)}</ul>}
        </section>
        <section className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-lg font-semibold">Processos por DETRAN</h2><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Buscar processo" placeholder="Buscar UF, processo ou etapa" value={busca} onChange={e => setBusca(e.target.value)} /><select aria-label="Filtrar processos" className={selectClass} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos os processos</option><option value="pendencias">Com ações da empresa</option><option value="abertos">Em acompanhamento</option><option value="concluidos">Concluídos</option></select></div></div>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{linhas.map(p => <article key={p.id} className="flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">DETRAN-{p.uf}</h3><Badge variant="outline">{p.etapa}</Badge></div><p className="break-all font-mono text-sm">{p.numero}</p><p className="text-xs text-muted-foreground">{p.origem} · Última atualização: {dataFormatada(p.atualizado)}</p><p className="text-sm text-muted-foreground">Responsável pela etapa: {p.responsavel}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{p.manual ? 'Conferir notificações no SEI' : `${p.pendencias.length} ação(ões) da empresa`}</span><Button variant="outline" onClick={() => setSelecionado(p.id)} aria-label={`Ver andamento ${p.numero}`}><ClipboardList className="h-4 w-4" /> Ver andamento</Button></div></article>)}{!linhas.length && <p className="p-8 text-center text-sm text-muted-foreground">{processos.length ? 'Nenhum processo corresponde aos filtros.' : 'Ainda não há processos registrados para esta empresa.'}</p>}</div>
        </section>
      </>}
    </>}
    <Dialog open={Boolean(detalhe)} onOpenChange={open => { if (!open) setSelecionado(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" aria-describedby="acompanhamento-fonte"><DialogHeader><DialogTitle>Andamento · DETRAN-{detalhe?.uf}</DialogTitle></DialogHeader>
      {detalhe && <><p id="acompanhamento-fonte" className="break-all text-sm text-muted-foreground">{detalhe.numero} · {detalhe.origem}</p>
        {detalhe.manual ? <><ol className="space-y-3">{detalhe.eventos.map(ev => <li key={ev.etapa_id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{ETAPAS_ESTEIRA[ev.etapa_id] || `Etapa ${ev.etapa_id}`}</h3><Badge variant="outline">{STATUS_ETAPA[ev.status] || 'Não informada'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Data: {dataFormatada(ev.data)} · Responsável: {ev.responsavel || 'Não informado'}</p>{ev.prazo && <p className="text-xs text-muted-foreground">Prazo registrado: {dataFormatada(ev.prazo)}</p>}{ev.obs && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{ev.obs}</p>}{ev.docs && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">Documentos: {ev.docs}</p>}</li>)}</ol><ProcessoSeiTab key={detalhe.id} estadoSigla={detalhe.uf} /></> : <Button asChild><Link to={detalhe.href}><ExternalLink className="h-4 w-4" /> Abrir credenciamento e checklist</Link></Button>}
      </>}
    </DialogContent></Dialog>
  </div></DashboardLayout>;
}
