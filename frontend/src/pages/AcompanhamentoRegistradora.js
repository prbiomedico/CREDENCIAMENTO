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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
        <section className="space-y-4" aria-label="Processos e pendências por DETRAN">
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-sm text-muted-foreground" aria-label="Resumo do acompanhamento">
            <span><strong className="text-foreground">{processos.length}</strong> processos</span>
            <span><strong className="text-foreground">{pendencias.length}</strong> ações da empresa</span>
            <span><strong className="text-foreground">{processos.filter(p => p.aguardandoOrgao).length}</strong> aguardando análise no SIGCR</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Buscar processo" placeholder="Buscar DETRAN, processo ou etapa" value={busca} onChange={e => setBusca(e.target.value)} className="sm:max-w-md" />
            <select aria-label="Filtrar processos" className={selectClass} value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="todos">Todos os processos</option><option value="pendencias">Com ações da empresa</option><option value="abertos">Em acompanhamento</option><option value="concluidos">Concluídos</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="hidden grid-cols-[1fr_1fr_1.3fr_auto] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground lg:grid" aria-hidden="true">
              <span>DETRAN / Processo</span><span>Etapa atual</span><span>Pendência / Próxima ação</span><span className="w-36">Detalhes</span>
            </div>
            {Array.from(new Set(linhas.map(p => p.uf))).map(uf => <section key={uf} aria-label={`Processos DETRAN-${uf}`}>
              <h2 className="border-b border-border bg-muted/20 px-4 py-2 text-sm font-semibold">DETRAN-{uf}</h2>
              <div className="divide-y divide-border">{linhas.filter(p => p.uf === uf).map(p => <article key={p.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-start">
                <div className="min-w-0"><p className="break-all font-mono text-sm font-medium">{p.numero}</p><p className="mt-1 text-xs text-muted-foreground">{p.origem}</p><p className="mt-1 text-xs text-muted-foreground">Atualização: {dataFormatada(p.atualizado)}</p></div>
                <div className="min-w-0"><Badge variant="outline" className="whitespace-normal">{p.etapa}</Badge><p className="mt-2 break-words text-xs text-muted-foreground">Responsável: {p.responsavel}</p></div>
                <div className="min-w-0 space-y-3">
                  {p.pendencias.length ? <><ul className="space-y-3">{p.pendencias.map(item => <li key={item.id}><p className="text-sm font-medium">DETRAN-{p.uf} · {item.titulo}</p><p className="mt-1 break-words text-xs text-muted-foreground">{item.descricao}</p>{item.prazo && <p className="mt-1 text-xs text-muted-foreground">Prazo: {dataFormatada(item.prazo)}</p>}</li>)}</ul><Button asChild size="sm"><Link to={p.href}>Resolver pendência</Link></Button></> : <p className="text-sm text-muted-foreground">{p.manual ? (p.validade ? `Vigência registrada até ${dataFormatada(p.validade)}.` : p.usaSei ? 'Conferir notificações no SEI.' : 'Conferir o histórico e as comunicações do DETRAN.') : p.concluido ? 'Processo concluído.' : p.aguardandoOrgao ? 'Aguardar retorno do DETRAN.' : 'Nenhuma ação da empresa registrada no fluxo digital.'}</p>}
                </div>
                <Button variant="outline" className="lg:w-36" onClick={() => setSelecionado(p.id)} aria-label={`Ver andamento ${p.numero}`}><ClipboardList className="h-4 w-4" /> Ver andamento</Button>
              </article>)}</div>
            </section>)}
            {!linhas.length && <p className="p-8 text-center text-sm text-muted-foreground">{processos.length ? 'Nenhum processo corresponde aos filtros.' : 'Ainda não há processos registrados para esta empresa.'}</p>}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">As ações acima vêm do fluxo registrado no SIGCR. Movimentações internas do SEI não geram pendências automaticamente; confira as notificações destinadas à empresa no acesso externo.</p>
        </section>
      </>}
    </>}
    <Dialog open={Boolean(detalhe)} onOpenChange={open => { if (!open) setSelecionado(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" aria-describedby="acompanhamento-fonte"><DialogHeader><DialogTitle>Andamento · DETRAN-{detalhe?.uf}</DialogTitle></DialogHeader>
      {detalhe && <><p id="acompanhamento-fonte" className="break-all text-sm text-muted-foreground">{detalhe.numero} · {detalhe.origem}</p>
        {detalhe.manual ? <Tabs defaultValue="resumo" key={detalhe.id}>
          <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="resumo">Resumo</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger><TabsTrigger value="documentos">Documentos</TabsTrigger>{detalhe.usaSei && <TabsTrigger value="sei">Consulta SEI</TabsTrigger>}</TabsList>
          <TabsContent value="resumo" className="space-y-4 pt-3">
            <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Etapa atual</dt><dd className="mt-1 font-medium">{detalhe.etapa}</dd></div><div><dt className="text-xs text-muted-foreground">Responsável informado</dt><dd className="mt-1 font-medium">{detalhe.responsavel}</dd></div><div><dt className="text-xs text-muted-foreground">Atualização do registro</dt><dd className="mt-1">{dataFormatada(detalhe.atualizado)}</dd></div>{detalhe.validade && <div><dt className="text-xs text-muted-foreground">Fim da vigência registrada</dt><dd className="mt-1">{dataFormatada(detalhe.validade)}</dd></div>}</dl>
            <p className="border-t border-border pt-4 text-sm leading-6 text-muted-foreground">Este acompanhamento foi registrado manualmente. Consulte o histórico e as comunicações do órgão para verificar notificações dirigidas à empresa.</p>
          </TabsContent>
          <TabsContent value="historico" className="pt-3"><ol className="divide-y divide-border">{detalhe.eventos.map(ev => <li key={ev.etapa_id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{ETAPAS_ESTEIRA[ev.etapa_id] || `Etapa ${ev.etapa_id}`}</h3><Badge variant="outline">{STATUS_ETAPA[ev.status] || 'Não informada'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Data: {dataFormatada(ev.data)} · Responsável: {ev.responsavel || 'Não informado'}</p>{ev.prazo && <p className="text-xs text-muted-foreground">Prazo registrado: {dataFormatada(ev.prazo)}</p>}{ev.obs && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{ev.obs}</p>}</li>)}</ol></TabsContent>
          <TabsContent value="documentos" className="space-y-4 pt-3"><p className="text-xs text-muted-foreground">Referências documentais informadas em cada etapa.</p>{detalhe.eventos.filter(ev => ev.docs).map(ev => <div key={ev.etapa_id} className="border-b border-border pb-4"><h3 className="text-sm font-semibold">{ETAPAS_ESTEIRA[ev.etapa_id]}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{ev.docs}</p></div>)}{!detalhe.eventos.some(ev => ev.docs) && <p className="text-sm text-muted-foreground">Nenhuma referência documental registrada.</p>}</TabsContent>
          <TabsContent value="sei" className="pt-3"><ProcessoSeiTab key={detalhe.id} estadoSigla={detalhe.uf} /></TabsContent>
        </Tabs> : <Button asChild><Link to={detalhe.href}><ExternalLink className="h-4 w-4" /> Abrir credenciamento e checklist</Link></Button>}
      </>}
    </DialogContent></Dialog>
  </div></DashboardLayout>;
}
