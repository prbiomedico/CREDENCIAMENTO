import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  FileText, Loader2, CheckCircle, Clock, XCircle, AlertTriangle,
  Download, ListChecks, ChevronRight, Check, X as XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useViewContext } from '../contexts/ViewContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_SUBMISSAO_CFG = {
  rascunho: { label: 'Rascunho', className: 'bg-zinc-800 text-zinc-400 border-input' },
  submetido: { label: 'Submetido', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  em_analise: { label: 'Em Análise', icon: Clock, className: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  em_diligencia: { label: 'Em Diligência', icon: AlertTriangle, className: 'bg-primary-500/10 text-primary-400 border-primary-500/20' },
  homologado: { label: 'Homologado', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
};

const STATUS_ITEM_CFG = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-zinc-800 text-zinc-400 border-input' },
  enviado: { label: 'Enviado', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  conforme: { label: 'Conforme', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  inconforme: { label: 'Inconforme', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

const PainelConferencia = () => {
  const { user, initialized } = useAuth();
  const { viewingAs } = useViewContext();
  const [searchParams] = useSearchParams();
  const [ufs, setUfs] = useState([]);
  const [estadoSigla, setEstadoSigla] = useState(user?.detran_uf || '');
  const [submissoes, setSubmissoes] = useState([]);
  const [empresasPorId, setEmpresasPorId] = useState({});
  const [portariasPorId, setPortariasPorId] = useState({});
  const [loading, setLoading] = useState(false);
  const [submissaoAtivaId, setSubmissaoAtivaId] = useState(null);
  const [justificativas, setJustificativas] = useState({});
  const [mostrarJustificativa, setMostrarJustificativa] = useState({});
  const [analisando, setAnalisando] = useState(null);
  const [homologando, setHomologando] = useState(false);
  // Fatia 2 (modelo Credencia-CE): perfil_empresa agora pode ser qualquer
  // categoria do catálogo, não só "registradora"/"financeira" — resolve o
  // tipo_id pro nome de exibição em vez de mostrar o id cru.
  const [tipos, setTipos] = useState([]);
  useEffect(() => {
    axios.get(`${API}/tipos-credenciamento`, { withCredentials: true })
      .then((res) => setTipos(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);
  const nomeCategoria = (tipoId) => tipos.find((t) => t.tipo_id === tipoId)?.nome || tipoId;

  // Quando sigcr_admin está simulando uma empresa (Registradora/Financeira)
  // via Trocar Visão, nenhuma ação de gestão/admin deste painel (seletor de
  // UF, marcar item conforme/inconforme, homologar) pode aparecer — mesmo
  // com o JWT real ainda sendo sigcr_admin, a simulação precisa refletir
  // exatamente o que a empresa vê (que nunca confere/homologa a própria
  // submissão, isso é sempre papel do DETRAN).
  const simulandoEmpresa = viewingAs?.tipo === 'empresa';
  const ehAdmin = user?.perfil === 'sigcr_admin' && !simulandoEmpresa;
  const podeConferir = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil) && !simulandoEmpresa;

  useEffect(() => {
    if (!ehAdmin) return;
    axios.get(`${API}/estados`, { withCredentials: true })
      .then((res) => setUfs(Array.isArray(res.data) ? res.data.filter((e) => e.configurado) : []))
      .catch(() => {});
  }, [ehAdmin]);

  const fetchSubmissoes = useCallback(async () => {
    if (!estadoSigla) return;
    setLoading(true);
    try {
      const [subRes, estadoRes] = await Promise.all([
        axios.get(`${API}/submissoes`, { withCredentials: true, params: { estado_sigla: estadoSigla } }),
        axios.get(`${API}/estados/${estadoSigla}`, { withCredentials: true }),
      ]);
      const lista = Array.isArray(subRes.data) ? subRes.data : [];
      setSubmissoes(lista);

      const nomesPorId = {};
      (estadoRes.data?.empresas_credenciadas || []).forEach((e) => { nomesPorId[e.company_id] = e; });
      setEmpresasPorId(nomesPorId);

      const idsPortarias = [...new Set(lista.map((s) => s.portaria_id))];
      const portariasFaltando = idsPortarias.filter((id) => !portariasPorId[id]);
      if (portariasFaltando.length > 0) {
        const resultados = await Promise.all(
          portariasFaltando.map((id) => axios.get(`${API}/portarias/${id}`, { withCredentials: true }).catch(() => null))
        );
        setPortariasPorId((prev) => {
          const novo = { ...prev };
          resultados.forEach((r, i) => { if (r) novo[portariasFaltando[i]] = r.data; });
          return novo;
        });
      }
    } catch (error) {
      console.error('Erro ao carregar submissões:', error);
      toast.error('Erro ao carregar painel de conferência');
    } finally {
      setLoading(false);
    }
  }, [estadoSigla]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (initialized) fetchSubmissoes(); }, [initialized, fetchSubmissoes]);

  // Deep-link vindo da notificação "submissao_recebida" que o DETRAN recebe
  // (ver PENDING_ACTIONS.md, ciclo Portaria→Submissão). detran/detran_admin
  // já estão sempre na própria UF (estadoSigla parte de user.detran_uf e o
  // backend nunca deixa passar outra — ver _perfil_pode_ver_estado em
  // GET /submissoes), então o caso comum é só selecionar o id assim que a
  // lista carregar. sigcr_admin é quem pode estar numa UF errada — busca a
  // submissão avulsa pra descobrir a UF certa e trocar o filtro.
  useEffect(() => {
    const submissaoIdParam = searchParams.get('submissao_id');
    if (!submissaoIdParam || submissaoAtivaId === submissaoIdParam) return;
    const jaNaLista = submissoes.some((s) => s.submissao_id === submissaoIdParam);
    if (jaNaLista) {
      setSubmissaoAtivaId(submissaoIdParam);
    } else if (ehAdmin && !loading) {
      axios.get(`${API}/submissoes/${submissaoIdParam}`, { withCredentials: true })
        .then((res) => {
          if (res.data?.estado_sigla && res.data.estado_sigla !== estadoSigla) {
            setEstadoSigla(res.data.estado_sigla);
          }
          setSubmissaoAtivaId(submissaoIdParam);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, submissoes, loading, ehAdmin]);

  const submissaoAtiva = submissoes.find((s) => s.submissao_id === submissaoAtivaId) || null;

  const analisarItem = async (itemId, status) => {
    const justificativa = justificativas[itemId] || '';
    if (status === 'inconforme' && !justificativa.trim()) {
      toast.error('Justificativa é obrigatória para marcar um item como inconforme');
      setMostrarJustificativa((p) => ({ ...p, [itemId]: true }));
      return;
    }
    setAnalisando(itemId);
    try {
      const res = await axios.patch(
        `${API}/submissoes/${submissaoAtivaId}/itens/${itemId}`,
        { status, justificativa: status === 'inconforme' ? justificativa : null },
        { withCredentials: true }
      );
      setSubmissoes((prev) => prev.map((s) => (s.submissao_id === res.data.submissao_id ? res.data : s)));
      setMostrarJustificativa((p) => ({ ...p, [itemId]: false }));
      toast.success(status === 'conforme' ? 'Item marcado como conforme' : 'Item marcado como inconforme — empresa notificada');
    } catch (error) {
      console.error('Erro ao analisar item:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao analisar item');
    } finally {
      setAnalisando(null);
    }
  };

  const homologar = async () => {
    setHomologando(true);
    try {
      const res = await axios.post(`${API}/submissoes/${submissaoAtivaId}/homologar`, null, { withCredentials: true });
      setSubmissoes((prev) => prev.map((s) => (s.submissao_id === res.data.submissao_id ? res.data : s)));
      toast.success('Submissão homologada — credenciamento atualizado');
    } catch (error) {
      console.error('Erro ao homologar:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao homologar');
    } finally {
      setHomologando(false);
    }
  };

  const baixarComprovante = async (submissaoId) => {
    try {
      const res = await axios.get(`${API}/submissoes/${submissaoId}/comprovante`, {
        withCredentials: true, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comprovante_${submissaoId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Erro ao baixar comprovante:', error);
      toast.error('Erro ao baixar comprovante');
    }
  };

  const nomeEmpresa = (companyId) => empresasPorId[companyId]?.nome_fantasia || empresasPorId[companyId]?.name || companyId;
  const tituloPortaria = (portariaId) => {
    const p = portariasPorId[portariaId];
    if (!p) return portariaId;
    return p.numero ? `${p.numero} — ${p.title}` : p.title;
  };

  const todasConformes = submissaoAtiva && submissaoAtiva.itens.length > 0 &&
    submissaoAtiva.itens.every((i) => i.status === 'conforme');

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Painel de Conferência</h1>
            <p className="text-zinc-400 text-sm mt-1">Análise das submissões de credenciamento por portaria</p>
          </div>
          {ehAdmin && (
            <Select value={estadoSigla} onValueChange={(v) => { setEstadoSigla(v); setSubmissaoAtivaId(null); }}>
              <SelectTrigger className="w-48 bg-card border-input text-white">
                <SelectValue placeholder="Selecione a UF" />
              </SelectTrigger>
              <SelectContent className="bg-card border-input text-white">
                {ufs.map((e) => (
                  <SelectItem key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando...</span>
          </div>
        ) : !estadoSigla ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center text-zinc-400">Selecione uma UF para ver as submissões.</CardContent>
          </Card>
        ) : submissoes.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <ListChecks className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhuma submissão de credenciamento para {estadoSigla} ainda.</p>
            </CardContent>
          </Card>
        ) : !submissaoAtiva ? (
          <div className="space-y-3">
            {submissoes.map((sub) => {
              const cfg = STATUS_SUBMISSAO_CFG[sub.status];
              return (
                <Card
                  key={sub.submissao_id}
                  className="bg-card border-border hover:border-primary-500/30 transition-colors cursor-pointer"
                  onClick={() => setSubmissaoAtivaId(sub.submissao_id)}
                >
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{nomeEmpresa(sub.company_id)}</p>
                      <p className="text-xs text-zinc-500 mt-1 truncate">{tituloPortaria(sub.portaria_id)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className="bg-zinc-800 text-zinc-400 border-input text-[10px] font-mono uppercase">
                        {nomeCategoria(sub.perfil_empresa)}
                      </Badge>
                      <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5`}>
                        {cfg.icon && <cfg.icon className="h-3 w-3 mr-1" />}{cfg.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            <Button variant="link" size="sm" onClick={() => setSubmissaoAtivaId(null)} className="h-auto p-0 text-zinc-400 hover:text-white">
              ← Voltar pra lista de submissões
            </Button>

            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{nomeEmpresa(submissaoAtiva.company_id)}</h2>
                <p className="text-xs text-zinc-500 mt-1">{tituloPortaria(submissaoAtiva.portaria_id)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`${STATUS_SUBMISSAO_CFG[submissaoAtiva.status].className} font-mono uppercase text-xs`}>
                  {STATUS_SUBMISSAO_CFG[submissaoAtiva.status].label}
                </Badge>
                {submissaoAtiva.status === 'homologado' ? (
                  <Button onClick={() => baixarComprovante(submissaoAtiva.submissao_id)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    <Download className="h-4 w-4" /> Comprovante
                  </Button>
                ) : podeConferir ? (
                  <Button
                    onClick={homologar}
                    disabled={!todasConformes || homologando}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                    title={todasConformes ? '' : 'Todos os itens precisam estar conformes'}
                  >
                    {homologando ? 'Homologando...' : 'Homologar'}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              {submissaoAtiva.itens.map((item) => {
                const cfg = STATUS_ITEM_CFG[item.status];
                const podeAnalisar = podeConferir && item.status === 'enviado';
                return (
                  <Card key={item.item_id} className="bg-card border-border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-200 font-medium">{item.nome}</p>
                          {item.descricao && <p className="text-xs text-zinc-500 mt-0.5">{item.descricao}</p>}
                        </div>
                        <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5 shrink-0`}>
                          <cfg.icon className="h-3 w-3 mr-1" />{cfg.label}
                        </Badge>
                      </div>

                      {item.document_id && (
                        <a
                          href={`${API}/documents/download/${item.document_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
                        >
                          <FileText className="h-3.5 w-3.5" /> Ver documento enviado
                        </a>
                      )}

                      {podeAnalisar && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" onClick={() => analisarItem(item.item_id, 'conforme')} disabled={analisando === item.item_id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 gap-1">
                            <Check className="h-3.5 w-3.5" /> Conforme
                          </Button>
                          <Button size="sm" variant="destructive-outline" onClick={() => setMostrarJustificativa((p) => ({ ...p, [item.item_id]: !p[item.item_id] }))}
                            className="gap-1">
                            <XIcon className="h-3.5 w-3.5" /> Inconforme
                          </Button>
                        </div>
                      )}

                      {mostrarJustificativa[item.item_id] && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="Justificativa da diligência (obrigatória)"
                            value={justificativas[item.item_id] || ''}
                            onChange={(e) => setJustificativas((p) => ({ ...p, [item.item_id]: e.target.value }))}
                            className="bg-zinc-800 border-input text-white text-sm min-h-[70px]"
                          />
                          <Button size="sm" variant="destructive" onClick={() => analisarItem(item.item_id, 'inconforme')} disabled={analisando === item.item_id}>
                            Confirmar Inconformidade
                          </Button>
                        </div>
                      )}

                      {item.status === 'inconforme' && item.justificativa && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                          <p className="text-xs text-red-400"><strong>Justificativa:</strong> {item.justificativa}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PainelConferencia;
