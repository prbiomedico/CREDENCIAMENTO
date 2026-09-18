import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import MinhasSubmissoes from './MinhasSubmissoes';
import ProcessoSeiTab from '../components/ProcessoSeiTab';
import { useAuth } from '../contexts/AuthContext';
import { useViewContext } from '../contexts/ViewContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { STATUS_PROCESSO, ETAPAS_ESTEIRA, STATUS_ETAPA } from '../lib/acompanhamento';
const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
const data = v => v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';

export default function AcompanhamentoEstado() {
  const { uf: ufParam } = useParams();
  const uf = ufParam?.toUpperCase();
  const [params] = useSearchParams();
  const companyId = params.get('empresa');
  const { user, initialized, isAdmin } = useAuth();
  const { viewingAs } = useViewContext();
  const [result, setResult] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState('resumo');
  const [pedido, setPedido] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [portaria, setPortaria] = useState('');
  const contexto = `${companyId}:${uf}:${user?.user_id}:${viewingAs?.tipo}:${viewingAs?.id}`;
  const permitido = companyId && viewingAs?.tipo !== 'detran' && (viewingAs?.tipo !== 'empresa' || viewingAs.id === companyId);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setErro(''); setPedido(null); setAba('resumo'); setPortaria('');
    if (!initialized || !user || !permitido) return () => controller.abort();
    axios.get(`${API}/companies/${encodeURIComponent(companyId)}/acompanhamento/${encodeURIComponent(uf)}`, { withCredentials: true, params: isAdmin ? { view_as_company_id: companyId } : {}, signal: controller.signal })
      .then(({ data: payload }) => { if (!controller.signal.aborted) { setResult({ contexto, payload }); const pedidoInicial = params.get('pedido'); if (payload.submissoes.some(s => s.submissao_id === pedidoInicial)) { setPedido(pedidoInicial); setAba('pedidos'); } } })
      .catch(e => { if (!controller.signal.aborted) setErro(e.response?.status === 403 || e.response?.status === 404 ? 'Acompanhamento indisponível para este acesso.' : 'Não foi possível carregar o acompanhamento. Tente atualizar.'); });
    return () => controller.abort();
  }, [contexto, initialized, permitido, isAdmin, versao]);
  const d = result?.contexto === contexto ? result.payload : null;
  const baixar = async doc => {
    setErro('');
    try {
      const r = await axios.get(`${API}${doc.download_url}`, { withCredentials: true, responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = doc.file_name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setErro('Não foi possível baixar o documento.'); }
  };
  const renovar = async cred => {
    setOcupado(true); setErro('');
    try {
      const r = await axios.post(`${API}/credenciamentos/${encodeURIComponent(cred.credenciamento_id)}/renovacao`, null, { withCredentials: true, params: { portaria_id: portaria, ...(isAdmin ? { view_as_company_id: companyId } : {}) } });
      setResult(old => ({ ...old, payload: { ...old.payload, submissoes: [...old.payload.submissoes.filter(s => s.submissao_id !== r.data.submissao_id), { ...r.data, renovacao: cred.renovacao }] } }));
      setPedido(r.data.submissao_id); setAba('pedidos');
    } catch (e) { setErro(e.response?.data?.detail || 'Não foi possível iniciar a renovação.'); }
    finally { setOcupado(false); }
  };
  const docs = d ? [...d.oficiais, ...d.documentos] : [];
  const arquivos = docs.filter((doc, idx) => !doc.sha256 || docs.findIndex(x => x.sha256 === doc.sha256) === idx);
  const portarias = d?.portarias.filter(p => p.status === 'vigente') || [];
  const temSei = d?.esteiras.some(e => e.sei_processo);
  return <DashboardLayout><main className="space-y-6 p-4 sm:p-6 lg:p-8">
    <Link to="/acompanhamento" className="text-sm text-muted-foreground">← Todos os acompanhamentos</Link>
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">DETRAN-{uf} · {d?.empresa.nome_fantasia || d?.empresa.name || 'Acompanhamento'}</h1><p className="mt-1 text-sm text-muted-foreground">Credenciamento, documentos e comunicações da registradora neste estado.</p></div><Button variant="outline" onClick={() => setVersao(v => v + 1)}>Atualizar</Button></header>
    {!permitido && <p role="alert">Selecione a empresa em Acompanhamento para abrir este estado.</p>}
    {erro && <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm">{erro}</p>}
    {permitido && !d && !erro && <p>Carregando acompanhamento…</p>}
    {d && <>
      <div className="grid gap-3">{d.credenciamentos.map(cred => <section key={cred.credenciamento_id} className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">Credenciamento {cred.categoria || ''}</h2><Badge variant="outline">{cred.status === 'ativo' ? 'Ativo' : cred.status}</Badge><span className="text-sm">Vigência até {data(cred.validade)}</span></div><p className="mt-2 text-sm text-muted-foreground">{cred.extrato_contrato}</p><div className="mt-4 border-t pt-3"><p className="text-sm">{cred.renovacao.motivo}</p>{cred.renovacao.disponivel && <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Portaria para renovação" className="max-w-full rounded-md border bg-background p-2 text-sm" value={portaria} onChange={e => setPortaria(e.target.value)}><option value="">Selecione a portaria aplicável</option>{portarias.filter(p => (p.checklist_itens || []).some(i => i.perfil_alvo === cred.categoria)).map(p => <option key={p.portaria_id} value={p.portaria_id}>{p.title}</option>)}</select><Button disabled={ocupado || !portaria} onClick={() => renovar(cred)}>Solicitar renovação</Button></div>}</div></section>)}{!d.credenciamentos.length && <p className="rounded-lg border p-4 text-sm">Credenciamento ainda não registrado como concluído.</p>}</div>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="resumo">Visão geral</TabsTrigger><TabsTrigger value="documentos">Documentos</TabsTrigger><TabsTrigger value="pedidos">Pedidos e checklist</TabsTrigger><TabsTrigger value="historico">Andamento</TabsTrigger><TabsTrigger value="comunicacoes">Comunicações</TabsTrigger><TabsTrigger value="portarias">Portarias e termos</TabsTrigger>{temSei && <TabsTrigger value="sei">Consulta SEI</TabsTrigger>}</TabsList>
        <TabsContent value="resumo" className="space-y-4 pt-4"><h2 className="text-lg font-semibold">Quem faz o quê</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Responsável</th><th className="p-3">Ação</th><th className="p-3">Destinatário</th></tr></thead><tbody><tr className="border-b"><td className="p-3">Registradora</td><td className="p-3">Solicita credenciamento ou renovação; apresenta documentos e responde diligências.</td><td className="p-3">DETRAN-{uf}</td></tr><tr className="border-b"><td className="p-3">DETRAN-{uf}</td><td className="p-3">Analisa, solicita correções, agenda avaliações e decide sobre o credenciamento.</td><td className="p-3">Registradora</td></tr><tr><td className="p-3">Administração do SIGCR</td><td className="p-3">Organiza o acervo e registra atos externos, com identificação e histórico.</td><td className="p-3">Acompanhamento da empresa</td></tr></tbody></table></div><p className="text-sm text-muted-foreground">O credenciamento vigente permanece separado de novos pedidos. Documentos em preparação não são diligências do DETRAN. Comunicações importadas e notificações do SIGCR não confirmam protocolo em um sistema externo.</p></TabsContent>
        <TabsContent value="documentos" className="space-y-3 pt-4"><p className="text-sm text-muted-foreground">Documentos conjuntos aparecem uma vez no acervo e podem atender a mais de um item do checklist.</p>{arquivos.map(doc => <article key={doc.document_id || doc.documento_id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"><div className="min-w-0 flex-1"><h3 className="break-words font-medium">{doc.document_name || doc.nome}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{doc.file_name}</p>{doc.vencimento && <p className="mt-1 text-sm">Validade do documento: {data(doc.vencimento)}</p>}<p className="mt-2 text-xs leading-5 text-muted-foreground">{doc.notes}</p></div><Button variant="outline" onClick={() => baixar(doc)}>Baixar documento</Button></article>)}{!arquivos.length && <p>Nenhum documento vinculado a este acompanhamento.</p>}</TabsContent>
        <TabsContent value="pedidos" className="space-y-4 pt-4">{d.submissoes.map(s => <article key={s.submissao_id} className="rounded-lg border p-4"><h3 className="font-semibold">{s.finalidade === 'renovacao' ? 'Renovação' : 'Credenciamento'} · {s.renovacao && !s.renovacao.disponivel && s.status === 'rascunho' ? 'Acervo para futura renovação' : STATUS_PROCESSO[s.status] || s.status}</h3>{s.renovacao && <p className="mt-2 text-sm">{s.renovacao.motivo}</p>}<p className="mt-2 text-sm text-muted-foreground">{s.itens.filter(i => i.document_id).length} de {s.itens.length} itens com documento vinculado.</p><Button className="mt-3" variant="outline" onClick={() => setPedido(s.submissao_id)}>Consultar checklist</Button></article>)}{!d.submissoes.length && <p>Nenhum pedido registrado neste estado.</p>}{pedido && <MinhasSubmissoes key={`${companyId}:${pedido}`} embedded companyId={companyId} uf={uf} submissaoId={pedido} somenteLeitura={isAdmin} />}{d.solicitacoes.length > 0 && <div><h3 className="font-semibold">Solicitações por edital</h3>{d.solicitacoes.map(s => <p key={s.solicitacao_id} className="mt-2 text-sm">{s.etapa_atual} · {s.status}{s.observacoes_detran ? ` — ${s.observacoes_detran}` : ''}</p>)}</div>}</TabsContent>
        <TabsContent value="historico" className="space-y-5 pt-4">{d.esteiras.map(e => <section key={e.esteira_id}><h3 className="font-semibold">{e.numero_processo || e.sei_processo || 'Histórico registrado'}</h3><ol className="mt-3 divide-y">{e.eventos.filter(ev => ev.status === 'concluido' || ev.status === 'em_andamento' || ev.docs).map(ev => <li key={ev.etapa_id} className="py-3"><p className="font-medium">{ETAPAS_ESTEIRA[ev.etapa_id]} · {STATUS_ETAPA[ev.status]}</p><p className="mt-1 text-xs text-muted-foreground">{data(ev.data)} · {ev.responsavel || 'Responsável não informado'}</p><p className="mt-2 whitespace-pre-wrap text-sm">{ev.obs}</p></li>)}</ol></section>)}{d.submissoes.map(s => <section key={s.submissao_id}><h3 className="font-semibold">{s.finalidade === 'renovacao' ? 'Pedido de renovação' : 'Pedido de credenciamento'}</h3>{s.submetido_em && <p className="mt-2 text-sm">{data(s.submetido_em)} · Registradora → DETRAN-{uf}: pedido submetido no SIGCR.</p>}{s.itens.filter(i => i.analisado_em || i.historico?.length).map(i => <div key={i.item_id} className="mt-3 border-l pl-3"><p className="text-sm font-medium">{i.nome}</p>{i.analisado_em && <p className="text-sm">{data(i.analisado_em)} · Análise no SIGCR: {i.status}. {i.justificativa}</p>}{i.historico?.map((h, n) => <p key={n} className="mt-1 text-xs text-muted-foreground">{data(h.registrado_em)} · {h.justificativa || h.status}</p>)}</div>)}</section>)}</TabsContent>
        <TabsContent value="comunicacoes" className="space-y-3 pt-4"><p className="text-sm text-muted-foreground">Avisos do SIGCR destinados à empresa sobre os pedidos deste estado. Para responder uma diligência, abra o checklist do pedido. Esta área não envia mensagens ao SEI ou ao portal externo do DETRAN.</p>{d.comunicacoes.map(n => <article key={n.notificacao_id} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">SIGCR → {d.empresa.nome_fantasia || d.empresa.name} · {data(n.created_at)}</p><h3 className="mt-2 font-semibold">{n.titulo}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{n.mensagem}</p><Button className="mt-3" variant="outline" onClick={() => {setPedido(n.dados.submissao_id);setAba('pedidos');}}>Abrir pedido relacionado</Button></article>)}{!d.comunicacoes.length && <p className="rounded-lg border p-4 text-sm">Nenhuma comunicação vinculada encontrada no SIGCR. Isso não confirma ausência de notificações no portal do órgão.</p>}</TabsContent>
        <TabsContent value="portarias" className="space-y-3 pt-4">{d.portarias.map(p => <article key={p.portaria_id} className="rounded-lg border p-4"><h3 className="font-semibold">{p.title}</h3><p className="mt-1 text-sm">Norma do estado · {p.status}</p><a className="mt-2 inline-block text-sm underline" href={`${API}/public/atos-credenciamento/portaria/${encodeURIComponent(p.portaria_id)}/preview`} target="_blank" rel="noopener noreferrer">Consultar publicação</a></article>)}{d.oficiais.map(doc => <article key={doc.documento_id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-semibold">{doc.nome}</h3><p className="mt-1 text-sm">Documento vinculado à empresa · {doc.tipo}</p></div><Button variant="outline" onClick={() => baixar(doc)}>Baixar documento</Button></article>)}</TabsContent>
        {temSei && <TabsContent value="sei" className="pt-4"><ProcessoSeiTab estadoSigla={uf} /></TabsContent>}
      </Tabs>
    </>}
  </main></DashboardLayout>;
}
