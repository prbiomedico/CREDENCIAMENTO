import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Search, FileText, Calendar, ExternalLink, Sparkles, Loader2, Pencil, Trash2, ShieldOff, Link2,
  Folder, Plus, ChevronRight, Clock, CheckCircle, XCircle, Paperclip, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useViewContext } from '../contexts/ViewContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import QueridoDiarioBusca, { ESTADOS_IBGE } from '../components/QueridoDiarioBusca';
import ChecklistCatalogoPicker from '../components/ChecklistCatalogoPicker';
import { PageContainer, PageHeader, StatusBadge, TableToolbar, EmptyState } from '../design-system';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

// Ambiente único "Transparência" — fusão de Portarias.js + Editais.js (ver
// PENDING_ACTIONS.md, fatia 3 da fusão pedida pelo Pedro). Duas coleções
// Mongo diferentes (db.portarias, db.editais) continuam separadas — isto é
// reorganização de tela/navegação, não migração de dado. Mesmo padrão
// contextual (`podeGerenciar`) que as duas telas já usavam isoladamente.

const ORDEM_UFS = [...ESTADOS_IBGE.map((e) => e.sigla), 'SEM_UF'];
const nomeUf = (sigla) => ESTADOS_IBGE.find((e) => e.sigla === sigla)?.nome || 'Sem UF definida';

function agruparPorUf(portarias) {
  const porUf = new Map();
  for (const p of portarias) {
    const sigla = (p.estado_sigla || '').toUpperCase();
    const chave = ESTADOS_IBGE.some((e) => e.sigla === sigla) ? sigla : 'SEM_UF';
    if (!porUf.has(chave)) porUf.set(chave, []);
    porUf.get(chave).push(p);
  }
  return ORDEM_UFS.filter((uf) => porUf.has(uf)).map((uf) => ({ uf, nome: nomeUf(uf), itens: porUf.get(uf) }));
}

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const TIPOS_PORTARIA = [
  { value: 'credenciamento', label: 'Credenciamento' },
  { value: 'descredenciamento', label: 'Descredenciamento' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'outro', label: 'Outro' },
];

const STATUS_EDITAL = {
  aberto: { label: 'Aberto', tone: 'success', icon: CheckCircle },
  em_analise: { label: 'Em Análise', tone: 'analysis', icon: Clock },
  encerrado: { label: 'Encerrado', tone: 'neutral', icon: XCircle },
};

const emptyEditDataPortaria = () => ({
  title: '', numero: '', orgao_emissor: '', estado_sigla: '', tipo: '',
  date: new Date().toISOString().split('T')[0], status: 'vigente',
  summary: '', link_pdf: '',
});

const emptyFormDataEdital = () => ({
  titulo: '',
  descricao: '',
  uf: '',
  status: 'aberto',
  data_encerramento: '',
  documentos_obrigatorios: [],
  anexos: [],
  termo_adesao_path: '',
});

const AreaTransparencia = () => {
  const { user, initialized, keycloak, getToken: getTokenCtx } = useAuth();
  const { viewingAs } = useViewContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFiltro = searchParams.get('status'); // ex: ?status=vigente, vindo do card "Portarias" do Dashboard
  const portariaIdDestaque = searchParams.get('portaria_id'); // deep-link da notificação "novo_edital"
  const aba = searchParams.get('aba') === 'editais' ? 'editais' : 'portarias';
  const setAba = (valor) => setSearchParams((prev) => {
    const p = new URLSearchParams(prev);
    if (valor === 'portarias') p.delete('aba'); else p.set('aba', valor);
    return p;
  });

  // Mesmo padrão contextual nas duas abas: ações de gestão (criar/editar
  // portaria, criar/editar edital) só aparecem pra quem já tinha acesso às
  // rotas de escrita no backend. Quando sigcr_admin está "vendo como" uma
  // empresa (Registradora/Financeira) via Trocar Visão, essas ações somem
  // mesmo que o perfil real do JWT continue sendo sigcr_admin — a simulação
  // precisa refletir exatamente o que a empresa vê.
  const podeGerenciar = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil) && viewingAs?.tipo !== 'empresa';

  // Inverso de podeGerenciar: só registradora/financeira (nunca DETRAN/admin)
  // veem "Credenciar-se". Mesma lógica de viewingAs — sigcr_admin "vendo
  // como" uma empresa precisa ver exatamente o que a empresa vê, incluindo
  // este botão; um DETRAN/admin real, ou o próprio sigcr_admin sem simulação
  // ativa, nunca veem.
  const podeCredenciar = viewingAs?.tipo === 'empresa'
    || (!viewingAs && ['registradora', 'financeira'].includes(user?.perfil));

  // ══════════════ ABA PORTARIAS ══════════════
  const [portarias, setPortarias] = useState([]);
  const portariasFiltradas = React.useMemo(
    () => (statusFiltro ? portarias.filter((p) => p.status === statusFiltro) : portarias),
    [portarias, statusFiltro]
  );
  const gruposPorUf = React.useMemo(() => agruparPorUf(portariasFiltradas), [portariasFiltradas]);
  const [loadingPortarias, setLoadingPortarias] = useState(true);
  // Grupos de UF abertos no accordion — controlado (não uncontrolled/defaultValue)
  // só pra poder forçar a abertura do grupo certo quando chega um deep-link
  // (?portaria_id=, da notificação "novo_edital"); usuário continua livre pra
  // abrir/fechar outros grupos manualmente por cima disso.
  const [ufsAbertas, setUfsAbertas] = useState([]);
  useEffect(() => {
    if (!portariaIdDestaque || gruposPorUf.length === 0) return;
    const grupo = gruposPorUf.find((g) => g.itens.some((p) => p.portaria_id === portariaIdDestaque));
    if (grupo) setUfsAbertas((prev) => (prev.includes(grupo.uf) ? prev : [...prev, grupo.uf]));
    const el = document.getElementById(`portaria-${portariaIdDestaque}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [portariaIdDestaque, gruposPorUf]);
  const [credenciandoId, setCredenciandoId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const [editDialogOpenPortaria, setEditDialogOpenPortaria] = useState(false);
  const [editandoIdPortaria, setEditandoIdPortaria] = useState(null);
  const [editDataPortaria, setEditDataPortaria] = useState(emptyEditDataPortaria());
  const [editChecklistSelecionados, setEditChecklistSelecionados] = useState(new Set());
  const [editChecklistItens, setEditChecklistItens] = useState([]);
  const [salvandoEdicaoPortaria, setSalvandoEdicaoPortaria] = useState(false);
  const [enviandoPdfPortaria, setEnviandoPdfPortaria] = useState(false);

  const getToken = async () => {
    if (keycloak && keycloak.token) {
      if (keycloak.isTokenExpired(30)) {
        await keycloak.updateToken(30);
      }
    }
  };

  useEffect(() => {
    if (!initialized || !user) return;
    fetchPortarias();
    fetchEditais();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user]);

  const fetchPortarias = async () => {
    setLoadingPortarias(true);
    try {
      await getToken();
      const response = await axios.get(`${API}/portarias`, { withCredentials: true });
      setPortarias(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('Erro ao carregar portarias');
    } finally {
      setLoadingPortarias(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { fetchPortarias(); return; }
    try {
      const response = await axios.get(
        `${API}/portarias/search?q=${encodeURIComponent(searchQuery)}`,
        { withCredentials: true }
      );
      setPortarias(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('Erro ao buscar portarias');
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeText.trim()) { toast.error('Digite o texto para análise'); return; }
    setAnalyzing(true);
    try {
      const response = await axios.post(
        `${API}/portarias/analyze`,
        { text: analyzeText },
        { withCredentials: true }
      );
      setAnalysisResult(response.data.analysis);
      toast.success('Análise concluída!');
    } catch (error) {
      toast.error('Erro ao analisar portaria');
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePromover = (item, estadoSigla) => {
    const primeiroExcerto = (item.excerpts && item.excerpts[0]) || '';
    const textoLimpo = primeiroExcerto.replace(/<[^>]+>/g, '');
    const params = new URLSearchParams({
      titulo: '',
      descricao: textoLimpo,
      uf: estadoSigla || '',
      data_abertura: item.date ? item.date.split('T')[0] : '',
      querido_diario_url: item.url || '',
    });
    toast.info('Revise os dados no wizard e conclua o cadastro.');
    navigate(`/criar-evento?${params.toString()}`);
  };

  const handleDownloadPdf = async (portaria) => {
    if (!portaria.link_pdf) return;
    if (/^https?:\/\//.test(portaria.link_pdf)) {
      window.open(portaria.link_pdf, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const response = await axios.get(`${API}/portarias/${portaria.portaria_id}/pdf`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `portaria_${portaria.numero || portaria.portaria_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      toast.error('Erro ao baixar PDF da portaria');
    }
  };

  // Ponte visual Transparência → Credenciamento por Portaria (antes só
  // acessível pela tela separada MinhasSubmissoes.js). POST /submissoes é
  // get-or-create idempotente — clicar de novo numa portaria já iniciada só
  // retoma a submissão existente, não duplica. Reaproveita o deep-link
  // ?submissao_id= que MinhasSubmissoes.js já lê (mesma infra usada pelas
  // notificações), sem precisar de nenhuma mudança no backend.
  const iniciarCredenciamento = async (portaria) => {
    setCredenciandoId(portaria.portaria_id);
    try {
      const res = await axios.post(`${API}/submissoes`, null, {
        withCredentials: true,
        params: { portaria_id: portaria.portaria_id },
      });
      navigate(`/credenciamento-portaria?submissao_id=${res.data.submissao_id}`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao iniciar credenciamento');
    } finally {
      setCredenciandoId(null);
    }
  };

  const abrirEdicaoPortaria = (portaria) => {
    setEditandoIdPortaria(portaria.portaria_id);
    setEditDataPortaria({
      title: portaria.title || '',
      numero: portaria.numero || '',
      orgao_emissor: portaria.orgao_emissor || '',
      estado_sigla: portaria.estado_sigla || '',
      tipo: portaria.tipo || '',
      date: portaria.date ? portaria.date.split('T')[0] : new Date().toISOString().split('T')[0],
      status: portaria.status || 'vigente',
      summary: portaria.summary || '',
      link_pdf: portaria.link_pdf || '',
    });
    const itens = Array.isArray(portaria.checklist_itens) ? portaria.checklist_itens : [];
    setEditChecklistItens(itens);
    setEditChecklistSelecionados(new Set(itens.filter((i) => i.catalogo_item_id).map((i) => i.catalogo_item_id)));
    setEditDialogOpenPortaria(true);
  };

  const toggleEditChecklistItem = (catalogItem) => {
    setEditChecklistSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(catalogItem.item_id)) next.delete(catalogItem.item_id); else next.add(catalogItem.item_id);
      return next;
    });
    setEditChecklistItens((prev) => {
      const existe = prev.some((i) => i.catalogo_item_id === catalogItem.item_id);
      if (existe) return prev.filter((i) => i.catalogo_item_id !== catalogItem.item_id);
      return [...prev, {
        nome: catalogItem.nome, descricao: catalogItem.descricao,
        perfil_alvo: catalogItem.perfil_alvo, catalogo_item_id: catalogItem.item_id,
      }];
    });
  };

  const salvarEdicaoPortaria = async () => {
    if (!editDataPortaria.title.trim()) { toast.error('Informe o título'); return; }
    setSalvandoEdicaoPortaria(true);
    try {
      await axios.patch(`${API}/portarias/${editandoIdPortaria}`, {
        ...editDataPortaria,
        checklist_itens: editChecklistItens,
      }, { withCredentials: true });
      toast.success('Portaria atualizada');
      setEditDialogOpenPortaria(false);
      fetchPortarias();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar portaria');
    } finally {
      setSalvandoEdicaoPortaria(false);
    }
  };

  const handleUploadPdfPortaria = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editandoIdPortaria) return;
    setEnviandoPdfPortaria(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API}/portarias/${editandoIdPortaria}/pdf`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Preenche o campo de URL manual com o path do arquivo salvo — o
      // usuário ainda pode sobrescrever digitando um link externo por cima.
      setEditDataPortaria((prev) => ({ ...prev, link_pdf: res.data.link_pdf }));
      toast.success('PDF anexado');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar PDF');
    } finally {
      setEnviandoPdfPortaria(false);
      e.target.value = '';
    }
  };

  const handleExcluirOuRevogarPortaria = async (portaria) => {
    if (portaria.publicado_at) {
      if (portaria.status === 'revogada') return;
      if (!window.confirm(`Revogar a portaria "${portaria.title}"? Ela deixa de valer, mas o registro e as submissões continuam preservados.`)) return;
      try {
        await axios.patch(`${API}/portarias/${portaria.portaria_id}`, { status: 'revogada' }, { withCredentials: true });
        toast.success('Portaria revogada');
        fetchPortarias();
      } catch (error) {
        toast.error(error?.response?.data?.detail || 'Erro ao revogar portaria');
      }
      return;
    }
    if (!window.confirm(`Excluir a portaria "${portaria.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await axios.delete(`${API}/portarias/${portaria.portaria_id}`, { withCredentials: true });
      toast.success('Portaria excluída');
      fetchPortarias();
    } catch (error) {
      if (error?.response?.status === 409) {
        toast.error(error.response.data?.detail || 'Há submissões em andamento — revogue em vez de excluir.');
      } else {
        toast.error(error?.response?.data?.detail || 'Erro ao excluir portaria');
      }
    }
  };

  const renderPortariaCard = (portaria) => (
    <article
      key={portaria.portaria_id}
      id={`portaria-${portaria.portaria_id}`}
      className={`grid min-w-[760px] grid-cols-[minmax(260px,1fr)_150px_120px_minmax(220px,auto)] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30 ${
        portaria.portaria_id === portariaIdDestaque ? 'bg-primary-500/10 ring-1 ring-inset ring-primary-500/60' : ''
      }`}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {portaria.numero ? `${portaria.numero} — ` : ''}{portaria.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{portaria.summary || portaria.content}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {portaria.source && (
            <span className="font-mono text-primary-300">{portaria.source}</span>
              )}
              {portaria.orgao_emissor && (
            <span>{portaria.orgao_emissor}</span>
              )}
              {portaria.tipo && (
            <span>{TIPOS_PORTARIA.find((t) => t.value === portaria.tipo)?.label || portaria.tipo}</span>
              )}
              {Array.isArray(portaria.empresas_referenciadas) && portaria.empresas_referenciadas.length > 0 && (
            <span>{portaria.empresas_referenciadas.length} empresa(s)</span>
              )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{portaria.estado_sigla || portaria.detran || '—'}</span>
        <span className="mt-0.5 block">{nomeUf((portaria.estado_sigla || portaria.detran || '').toUpperCase())}</span>
      </div>
      <div className="space-y-1.5">
              {podeGerenciar && !portaria.link_pdf && (
                <StatusBadge tone="neutral">PDF pendente · oculto para empresas</StatusBadge>
              )}
              {podeGerenciar && !(portaria.checklist_itens || []).length && (
                <StatusBadge tone="neutral">Checklist não cadastrado</StatusBadge>
              )}
              {portaria.criado_via === 'wizard' && (
          <StatusBadge tone={portaria.publicado_at ? 'approved' : 'neutral'}>
                  {portaria.publicado_at ? 'Publicado' : 'Rascunho'}
          </StatusBadge>
              )}
              {portaria.status && (
          <StatusBadge tone={portaria.status === 'revogada' ? 'revoked' : 'approved'}>
                  {portaria.status === 'revogada' ? 'Revogada' : 'Vigente'}
          </StatusBadge>
              )}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {new Date(portaria.date).toLocaleDateString('pt-BR')}
        </span>
          {portaria.link_pdf && (
          <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(portaria)} title="Ver PDF">
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {portaria.link_publico && portaria.publicado_at && (
            <Button
            variant="ghost" size="sm" title="Copiar link público"
              onClick={() => { navigator.clipboard.writeText(portaria.link_publico); toast.success('Link copiado!'); }}
            >
              <Link2 className="h-3 w-3" />
            </Button>
          )}
          {podeGerenciar && (
          <>
            <Button variant="outline" size="sm" onClick={() => abrirEdicaoPortaria(portaria)}>
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
              {portaria.status !== 'revogada' && (
              <Button variant="destructive-ghost" size="icon" onClick={() => handleExcluirOuRevogarPortaria(portaria)} title={portaria.publicado_at ? 'Revogar' : 'Excluir'}>
                  {portaria.publicado_at ? <ShieldOff className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              )}
          </>
          )}
          {podeCredenciar && (
            portaria.link_pdf ? (
                <Button
                  size="sm"
                  onClick={() => iniciarCredenciamento(portaria)}
                  disabled={credenciandoId === portaria.portaria_id}
                >
                  {credenciandoId === portaria.portaria_id ? 'Iniciando...' : 'Credenciar-se'}
                </Button>
              ) : (
                <Button size="sm" disabled title="PDF pendente de publicação">
                PDF pendente
                </Button>
              )
          )}
      </div>
    </article>
  );

  // ══════════════ ABA EDITAIS ══════════════
  const [editais, setEditais] = useState([]);
  const [loadingEditais, setLoadingEditais] = useState(true);
  const [filtroUF, setFiltroUF] = useState('todos');

  const [editalParaCandidatar, setEditalParaCandidatar] = useState(null);
  const [empresasParaEscolher, setEmpresasParaEscolher] = useState([]);
  const [empresaEscolhida, setEmpresaEscolhida] = useState('');
  const [candidatando, setCandidatando] = useState(false);

  const [dialogOpenEdital, setDialogOpenEdital] = useState(false);
  const [editandoIdEdital, setEditandoIdEdital] = useState(null);
  const [formDataEdital, setFormDataEdital] = useState(emptyFormDataEdital());
  const [novoDocumento, setNovoDocumento] = useState('');
  const [salvandoEdital, setSalvandoEdital] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [enviandoTermo, setEnviandoTermo] = useState(false);
  const [termoNome, setTermoNome] = useState('');

  const fetchEditais = async () => {
    try { await getTokenCtx(); } catch {}
    try {
      const res = await axios.get(`${API}/editais`);
      setEditais(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Erro ao carregar editais'); }
    finally { setLoadingEditais(false); }
  };

  const enviarCandidatura = async (edital, companyId) => {
    setCandidatando(true);
    try {
      await axios.post(`${API}/solicitacoes`, {
        edital_id: edital.edital_id,
        company_id: companyId,
        uf: edital.uf
      });
      toast.success('Candidatura realizada! Veja em Solicitações.');
      setEditalParaCandidatar(null);
      navigate('/solicitacoes');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao candidatar');
    } finally {
      setCandidatando(false);
    }
  };

  const handleCandidatar = async (edital) => {
    try {
      const companies = await axios.get(`${API}/companies`);
      const empresas = Array.isArray(companies.data) ? companies.data : [];
      if (!empresas.length) {
        toast.error('Cadastre uma empresa primeiro');
        navigate('/registradoras-empresa');
        return;
      }
      if (empresas.length === 1) {
        await enviarCandidatura(edital, empresas[0].company_id);
        return;
      }
      setEmpresasParaEscolher(empresas);
      setEmpresaEscolhida('');
      setEditalParaCandidatar(edital);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao candidatar');
    }
  };

  const resetFormEdital = () => {
    setFormDataEdital(emptyFormDataEdital());
    setEditandoIdEdital(null);
    setNovoDocumento('');
    setTermoNome('');
  };

  const abrirNovoEdital = () => {
    resetFormEdital();
    setDialogOpenEdital(true);
  };

  const abrirEdicaoEdital = (edital) => {
    setFormDataEdital({
      titulo: edital.titulo || '',
      descricao: edital.descricao || '',
      uf: edital.uf || '',
      status: edital.status || 'aberto',
      data_encerramento: edital.data_encerramento ? edital.data_encerramento.split('T')[0] : '',
      documentos_obrigatorios: Array.isArray(edital.documentos_obrigatorios) ? edital.documentos_obrigatorios : [],
      anexos: Array.isArray(edital.anexos) ? edital.anexos : [],
      termo_adesao_path: edital.termo_adesao_path || '',
    });
    setEditandoIdEdital(edital.edital_id);
    setTermoNome(edital.termo_adesao_path ? 'Termo de adesão já enviado' : '');
    setDialogOpenEdital(true);
  };

  const adicionarDocumento = () => {
    if (!novoDocumento.trim()) return;
    setFormDataEdital((p) => ({ ...p, documentos_obrigatorios: [...p.documentos_obrigatorios, novoDocumento.trim()] }));
    setNovoDocumento('');
  };

  const removerDocumento = (idx) => {
    setFormDataEdital((p) => ({ ...p, documentos_obrigatorios: p.documentos_obrigatorios.filter((_, i) => i !== idx) }));
  };

  const uploadArquivo = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/editais/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  };

  const handleAnexoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoAnexo(true);
    try {
      const { nome, path } = await uploadArquivo(file);
      setFormDataEdital((p) => ({ ...p, anexos: [...p.anexos, { nome, path }] }));
      toast.success('Anexo enviado');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar anexo');
    } finally {
      setEnviandoAnexo(false);
      e.target.value = '';
    }
  };

  const removerAnexo = (idx) => {
    setFormDataEdital((p) => ({ ...p, anexos: p.anexos.filter((_, i) => i !== idx) }));
  };

  const handleTermoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoTermo(true);
    try {
      const { nome, path } = await uploadArquivo(file);
      setFormDataEdital((p) => ({ ...p, termo_adesao_path: path }));
      setTermoNome(nome);
      toast.success('Termo de adesão enviado');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar termo de adesão');
    } finally {
      setEnviandoTermo(false);
      e.target.value = '';
    }
  };

  const handleSubmitEdital = async (e) => {
    e.preventDefault();
    if (!formDataEdital.titulo || !formDataEdital.uf) {
      toast.error('Preencha título e UF');
      return;
    }
    setSalvandoEdital(true);
    try {
      if (editandoIdEdital) {
        await axios.patch(`${API}/editais/${editandoIdEdital}`, formDataEdital);
        toast.success('Edital atualizado com sucesso!');
      } else {
        await axios.post(`${API}/editais`, formDataEdital);
        toast.success('Edital criado com sucesso!');
      }
      setDialogOpenEdital(false);
      resetFormEdital();
      fetchEditais();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao salvar edital');
    } finally {
      setSalvandoEdital(false);
    }
  };

  const editaisFiltrados = filtroUF === 'todos' ? editais : editais.filter(e => e.uf === filtroUF);

  return (
    <DashboardLayout>
      <PageContainer className="space-y-5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">Início</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Portarias e editais</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          eyebrow="Transparência"
          title="Portarias e editais"
          description="Consulte e gerencie os atos e processos de credenciamento publicados pelos DETRANs."
          actions={podeGerenciar ? (
            <Button onClick={() => navigate('/criar-evento')} className="bg-primary-600 text-white hover:bg-primary-700">
              <Plus className="h-4 w-4" /> Criar evento
            </Button>
          ) : undefined}
        />

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="portarias">Portarias</TabsTrigger>
            <TabsTrigger value="editais">Editais</TabsTrigger>
          </TabsList>

          {/* ── ABA: PORTARIAS ── */}
          <TabsContent value="portarias" className="space-y-5 mt-5">
            <TableToolbar
              primary={(
                <div className="relative max-w-2xl">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Buscar por título, conteúdo ou DETRAN..."
                    aria-label="Buscar portarias"
                    className="pl-9"
                  />
                </div>
              )}
              actions={(
                <>
                  <Button onClick={handleSearch} variant="outline">
                    <Search className="h-4 w-4" /> Buscar
                  </Button>
                <Dialog open={analyzeDialogOpen} onOpenChange={setAnalyzeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Sparkles className="h-4 w-4 text-secondary-400" />
                      Analisar com IA
                    </Button>
                  </DialogTrigger>
                  <DialogContent overlayClassName="bg-black/60 backdrop-blur-none" className="max-w-2xl border-border bg-card text-foreground shadow-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-secondary-400" />
                        Análise de Portaria com IA
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Cole o texto da portaria aqui..."
                        value={analyzeText}
                        onChange={(e) => setAnalyzeText(e.target.value)}
                        className="bg-zinc-800 border-input text-white min-h-[160px]"
                      />
                      <Button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="w-full gap-2 bg-primary-600 text-white hover:bg-primary-700"
                      >
                        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {analyzing ? 'Analisando...' : 'Analisar'}
                      </Button>
                      {analysisResult && (
                        <div className="border border-border bg-muted p-4 text-sm text-foreground whitespace-pre-wrap">
                          {analysisResult}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                </>
              )}
            />

            {podeGerenciar && !loadingPortarias && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground" role="status">
                <strong className="text-foreground">Preparação do acervo: </strong>
                {portarias.filter((p) => !p.link_pdf).length} sem PDF ·{' '}
                {portarias.filter((p) => !(p.checklist_itens || []).length).length} sem checklist ·{' '}
                {portarias.filter((p) => p.link_pdf && (p.criado_via !== 'wizard' || p.publicado_at)).length} disponíveis para empresas.
                <p className="mt-1">Portarias sem PDF ficam ocultas para empresas. A classificação de vigência deve ser conferida na fonte oficial.</p>
              </div>
            )}

            {statusFiltro && (
              <div className="flex items-center gap-2 text-sm bg-primary-500/10 border border-primary-500/20 rounded-lg px-4 py-2 w-fit">
                <span className="text-primary-300">
                  Filtrando por status: <span className="font-mono uppercase">{statusFiltro}</span>
                </span>
                <Button
                  variant="link" size="sm"
                  onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('status'); return p; })}
                  className="h-auto p-0"
                >
                  limpar
                </Button>
              </div>
            )}

            {loadingPortarias ? (
              <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
                <span>Carregando portarias...</span>
              </div>
            ) : portariasFiltradas.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={statusFiltro ? `Nenhuma portaria com status “${statusFiltro}”` : 'Nenhuma portaria cadastrada'}
                description={!statusFiltro ? (podeGerenciar ? 'Crie um evento de credenciamento ou consulte os Diários Oficiais.' : 'Consulte os Diários Oficiais abaixo.') : undefined}
                action={!statusFiltro && podeGerenciar ? <Button onClick={() => navigate('/criar-evento')} className="bg-primary-600 text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Criar evento</Button> : undefined}
              />
            ) : (
              <Accordion type="multiple" className="border border-border" value={ufsAbertas} onValueChange={setUfsAbertas}>
                {gruposPorUf.map(({ uf, nome, itens }) => (
                  <AccordionItem key={uf} value={uf} className="border-b border-border px-4 last:border-b-0">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <span className="w-12 font-mono text-xs font-semibold text-primary-300">
                          {uf === 'SEM_UF' ? 'SEM UF' : uf}
                        </span>
                        <span className="text-sm font-medium text-foreground">{nome}</span>
                        <span className="text-xs text-muted-foreground">{itens.length} registro(s)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="overflow-x-auto pb-0">
                      <div className="border-t border-border">
                        <div className="grid min-w-[760px] grid-cols-[minmax(260px,1fr)_150px_120px_minmax(220px,auto)] gap-4 bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>Portaria</span><span>UF / órgão</span><span>Status</span><span className="text-right">Publicação e ações</span>
                        </div>
                        {itens.map((portaria) => renderPortariaCard(portaria))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            <div className="border-t border-border pt-8">
              <QueridoDiarioBusca onPromover={podeGerenciar ? handlePromover : undefined} />
            </div>
          </TabsContent>

          {/* ── ABA: EDITAIS ── */}
          <TabsContent value="editais" className="mt-6">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
              <p className="text-zinc-500 text-sm">Processos de credenciamento abertos pelos DETRANs</p>
              <div className="flex items-center gap-3">
                <Select value={filtroUF} onValueChange={setFiltroUF}>
                  <SelectTrigger className="bg-card border-border text-white w-36">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-white">
                    <SelectItem value="todos">Todos</SelectItem>
                    {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
                {podeGerenciar && (
                  <Dialog open={dialogOpenEdital} onOpenChange={(open) => { setDialogOpenEdital(open); if (!open) resetFormEdital(); }}>
                    <DialogTrigger asChild>
                      <Button onClick={abrirNovoEdital} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                        <Plus className="h-4 w-4" />
                        Novo Edital
                      </Button>
                    </DialogTrigger>
                    <DialogContent overlayClassName="bg-black/60 backdrop-blur-none" className="max-h-[90vh] overflow-y-auto border-border bg-card text-foreground shadow-lg">
                      <DialogHeader>
                        <DialogTitle>{editandoIdEdital ? 'Editar Edital' : 'Cadastrar Novo Edital'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSubmitEdital} className="space-y-4">
                        <div>
                          <Label className="text-zinc-300">Título</Label>
                          <Input value={formDataEdital.titulo} onChange={(e) => setFormDataEdital({ ...formDataEdital, titulo: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-zinc-300">UF</Label>
                            <Select value={formDataEdital.uf} onValueChange={(value) => setFormDataEdital({ ...formDataEdital, uf: value })}>
                              <SelectTrigger className="bg-zinc-800 border-input text-white mt-1">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-input text-white max-h-64">
                                {UFS.map((uf) => (
                                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-zinc-300">Status</Label>
                            <Select value={formDataEdital.status} onValueChange={(value) => setFormDataEdital({ ...formDataEdital, status: value })}>
                              <SelectTrigger className="bg-zinc-800 border-input text-white mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-input text-white">
                                <SelectItem value="aberto">Aberto</SelectItem>
                                <SelectItem value="encerrado">Encerrado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-zinc-300">Data de Encerramento</Label>
                          <Input type="date" value={formDataEdital.data_encerramento} onChange={(e) => setFormDataEdital({ ...formDataEdital, data_encerramento: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Descrição</Label>
                          <Textarea value={formDataEdital.descricao} onChange={(e) => setFormDataEdital({ ...formDataEdital, descricao: e.target.value })} className="bg-zinc-800 border-input text-white mt-1 min-h-[100px]" />
                        </div>

                        <div>
                          <Label className="text-zinc-300">Documentos Obrigatórios</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              value={novoDocumento}
                              onChange={(e) => setNovoDocumento(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarDocumento(); } }}
                              placeholder="Ex: Contrato Social"
                              className="bg-zinc-800 border-input text-white"
                            />
                            <Button type="button" onClick={adicionarDocumento} variant="outline" className="shrink-0">
                              Adicionar
                            </Button>
                          </div>
                          {formDataEdital.documentos_obrigatorios.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {formDataEdital.documentos_obrigatorios.map((doc, idx) => (
                                <Badge key={idx} className="bg-zinc-800 text-zinc-300 border-input gap-1 pr-1">
                                  {doc}
                                  <button type="button" onClick={() => removerDocumento(idx)} className="ml-1 hover:text-red-400">
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-border pt-4">
                          <Label className="text-zinc-300">Anexos (PDF)</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <Input type="file" accept="application/pdf" onChange={handleAnexoUpload} disabled={enviandoAnexo} className="bg-zinc-800 border-input text-white" />
                            {enviandoAnexo && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
                          </div>
                          {formDataEdital.anexos.length > 0 && (
                            <div className="space-y-1 mt-2">
                              {formDataEdital.anexos.map((a, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs bg-zinc-800/50 border border-input rounded px-2 py-1.5">
                                  <span className="flex items-center gap-1.5 text-zinc-300 truncate">
                                    <Paperclip className="h-3 w-3 shrink-0" /> {a.nome}
                                  </span>
                                  <button type="button" onClick={() => removerAnexo(idx)} className="text-zinc-500 hover:text-red-400 shrink-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <Label className="text-zinc-300">Termo de Adesão (PDF)</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <Input type="file" accept="application/pdf" onChange={handleTermoUpload} disabled={enviandoTermo} className="bg-zinc-800 border-input text-white" />
                            {enviandoTermo && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
                          </div>
                          {termoNome && (
                            <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5">
                              <Paperclip className="h-3 w-3" /> {termoNome}
                            </p>
                          )}
                        </div>

                        <Button type="submit" disabled={salvandoEdital} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
                          {salvandoEdital ? 'Salvando...' : editandoIdEdital ? 'Salvar Alterações' : 'Cadastrar'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {loadingEditais ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : editaisFiltrados.length === 0 ? (
              <EmptyState
                icon={Folder}
                title="Nenhum edital encontrado"
                description={podeGerenciar ? 'Cadastre o primeiro processo de credenciamento.' : 'Nenhum edital disponibilizado no acervo.'}
                action={podeGerenciar ? <Button onClick={abrirNovoEdital} className="bg-primary-600 text-white hover:bg-primary-700"><Plus className="h-4 w-4" /> Cadastrar edital</Button> : undefined}
              />
            ) : (
              <div className="overflow-x-auto border border-border">
                <div className="grid min-w-[760px] grid-cols-[100px_minmax(280px,1fr)_150px_150px_130px] gap-4 bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>UF</span><span>Edital</span><span>Status</span><span>Encerramento</span><span className="text-right">Ações</span>
                </div>
                {editaisFiltrados.map((edital) => {
                  const cfg = STATUS_EDITAL[edital.status] || STATUS_EDITAL.encerrado;
                  const Icon = cfg.icon;
                  const dias = Math.ceil((new Date(edital.data_encerramento) - new Date()) / (1000*60*60*24));
                  return (
                    <article key={edital.edital_id} className="grid min-w-[760px] grid-cols-[100px_minmax(280px,1fr)_150px_150px_130px] items-center gap-4 border-t border-border px-4 py-3 hover:bg-muted/30">
                      <span className="font-mono text-xs font-semibold text-primary-300">{edital.uf}</span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">{edital.titulo}</h3>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{edital.descricao}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Array.isArray(edital.anexos) && edital.anexos.length > 0 ? `${edital.anexos.length} anexo(s)` : 'Sem anexos'}
                          {edital.termo_adesao_path ? ' · Termo de adesão' : ''}
                        </p>
                      </div>
                      <StatusBadge tone={cfg.tone}><Icon className="mr-1 h-3 w-3" />{cfg.label}</StatusBadge>
                      <div className="text-xs text-muted-foreground">
                        <span className="block text-foreground">{new Date(edital.data_encerramento).toLocaleDateString('pt-BR')}</span>
                        {edital.status === 'aberto' && dias > 0 && <span className={dias <= 7 ? 'text-red-300' : ''}>{dias} dias restantes</span>}
                      </div>
                      <div className="flex justify-end gap-2">
                        {podeGerenciar && <Button variant="outline" size="sm" onClick={() => abrirEdicaoEdital(edital)}><Pencil className="h-4 w-4" /> Editar</Button>}
                        {!podeGerenciar && edital.status === 'aberto' && <Button size="sm" onClick={() => handleCandidatar(edital)}>Candidatar-se <ChevronRight className="h-4 w-4" /></Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PageContainer>

      {/* ── Dialog: Editar Portaria ── */}
      <Dialog open={editDialogOpenPortaria} onOpenChange={setEditDialogOpenPortaria}>
        <DialogContent overlayClassName="bg-black/60 backdrop-blur-none" className="max-h-[90vh] overflow-y-auto border-border bg-card text-foreground shadow-lg">
          <DialogHeader>
            <DialogTitle>Editar Portaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-300">Título</Label>
              <Input value={editDataPortaria.title} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, title: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Número da Portaria</Label>
                <Input value={editDataPortaria.numero} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, numero: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Órgão Emissor</Label>
                <Input value={editDataPortaria.orgao_emissor} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, orgao_emissor: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">UF (estado)</Label>
                <Input
                  value={editDataPortaria.estado_sigla}
                  onChange={(e) => setEditDataPortaria({ ...editDataPortaria, estado_sigla: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                  className="bg-zinc-800 border-input text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Status</Label>
                <Select value={editDataPortaria.status} onValueChange={(value) => setEditDataPortaria({ ...editDataPortaria, status: value })}>
                  <SelectTrigger className="bg-zinc-800 border-input text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-input text-white">
                    <SelectItem value="vigente">Vigente</SelectItem>
                    <SelectItem value="revogada">Revogada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Data</Label>
                <Input type="date" value={editDataPortaria.date} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, date: e.target.value })} className="bg-zinc-800 border-input text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Tipo</Label>
                <Select value={editDataPortaria.tipo} onValueChange={(value) => setEditDataPortaria({ ...editDataPortaria, tipo: value })}>
                  <SelectTrigger className="bg-zinc-800 border-input text-white mt-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-input text-white">
                    {TIPOS_PORTARIA.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-300">Resumo</Label>
              <Textarea value={editDataPortaria.summary} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, summary: e.target.value })} className="bg-zinc-800 border-input text-white mt-1 min-h-[80px]" />
            </div>
            <div>
              <Label className="text-zinc-300">Link do PDF</Label>
              <Input value={editDataPortaria.link_pdf} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, link_pdf: e.target.value })} placeholder="https://..." className="bg-zinc-800 border-input text-white mt-1" />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-zinc-500 shrink-0">ou envie o arquivo:</span>
                <Input type="file" accept="application/pdf" onChange={handleUploadPdfPortaria} disabled={enviandoPdfPortaria} className="bg-zinc-800 border-input text-white" />
                {enviandoPdfPortaria && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <Label className="text-zinc-300 mb-2 block">Checklist de exigências</Label>
              <ChecklistCatalogoPicker selecionados={editChecklistSelecionados} onToggle={toggleEditChecklistItem} />
            </div>

            <Button onClick={salvarEdicaoPortaria} disabled={salvandoEdicaoPortaria} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
              {salvandoEdicaoPortaria ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Escolher empresa pra candidatura ── */}
      <Dialog open={!!editalParaCandidatar} onOpenChange={(open) => { if (!open) setEditalParaCandidatar(null); }}>
        <DialogContent overlayClassName="bg-black/60 backdrop-blur-none" className="border-border bg-card text-foreground shadow-lg">
          <DialogHeader>
            <DialogTitle>Qual empresa está se candidatando?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Sua conta tem mais de uma empresa cadastrada. Selecione qual delas está se candidatando ao edital{editalParaCandidatar ? ` "${editalParaCandidatar.titulo}"` : ''}.
          </p>
          <Select value={empresaEscolhida} onValueChange={setEmpresaEscolhida}>
            <SelectTrigger className="bg-zinc-800 border-input text-white">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-white">
              {empresasParaEscolher.map((c) => (
                <SelectItem key={c.company_id} value={c.company_id}>
                  {c.nome_fantasia || c.name || c.company_id}
                  {c.tipo_empresa ? ` (${c.tipo_empresa})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              disabled={!empresaEscolhida || candidatando}
              onClick={() => enviarCandidatura(editalParaCandidatar, empresaEscolhida)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              Confirmar candidatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AreaTransparencia;
