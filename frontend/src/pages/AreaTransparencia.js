import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Search, FileText, Calendar, ExternalLink, Sparkles, Loader2, Pencil, Trash2, ShieldOff, Link2,
  Folder, Plus, ChevronRight, Clock, CheckCircle, XCircle, Paperclip, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
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
  aberto: { label: 'Aberto', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  em_analise: { label: 'Em Análise', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Clock },
  encerrado: { label: 'Encerrado', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: XCircle },
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
    <Card
      key={portaria.portaria_id}
      id={`portaria-${portaria.portaria_id}`}
      className={`bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors ${
        portaria.portaria_id === portariaIdDestaque ? 'ring-2 ring-primary-500 border-primary-500/50' : ''
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-white mb-2">
              {portaria.numero ? `${portaria.numero} — ` : ''}{portaria.title}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              {portaria.source && (
                <Badge className="bg-primary-500/10 text-primary-400 border-primary-500/20 font-mono text-xs">
                  {portaria.source}
                </Badge>
              )}
              {(portaria.estado_sigla || portaria.detran) && (
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">
                  DETRAN {portaria.estado_sigla || portaria.detran}
                </Badge>
              )}
              {portaria.orgao_emissor && (
                <Badge className="bg-zinc-700/50 text-zinc-300 border-zinc-600 font-mono text-xs">
                  {portaria.orgao_emissor}
                </Badge>
              )}
              {portaria.tipo && (
                <Badge className="bg-secondary-500/10 text-secondary-400 border-secondary-500/20 font-mono text-xs">
                  {TIPOS_PORTARIA.find((t) => t.value === portaria.tipo)?.label || portaria.tipo}
                </Badge>
              )}
              {Array.isArray(portaria.empresas_referenciadas) && portaria.empresas_referenciadas.length > 0 && (
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-mono text-xs">
                  {portaria.empresas_referenciadas.length} empresa(s) referenciada(s)
                </Badge>
              )}
              {portaria.criado_via === 'wizard' && (
                <Badge className={portaria.publicado_at
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs'
                  : 'bg-zinc-700/50 text-zinc-400 border-zinc-600 text-xs'}>
                  {portaria.publicado_at ? 'Publicado' : 'Rascunho'}
                </Badge>
              )}
              {portaria.status && (
                <Badge className={portaria.status === 'revogada'
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 text-xs'
                  : 'bg-green-500/10 text-green-400 border-green-500/20 text-xs'}>
                  {portaria.status === 'revogada' ? 'Revogada' : 'Vigente'}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 shrink-0">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(portaria.date).toLocaleDateString('pt-BR')}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-zinc-400 line-clamp-2">{portaria.summary || portaria.content}</p>
        <div className="flex items-center gap-4 mt-3">
          {portaria.link_pdf && (
            <button
              type="button"
              onClick={() => handleDownloadPdf(portaria)}
              className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
            >
              <ExternalLink className="h-3 w-3" />
              Ver PDF
            </button>
          )}
          {portaria.link_publico && portaria.publicado_at && (
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(portaria.link_publico); toast.success('Link copiado!'); }}
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              <Link2 className="h-3 w-3" />
              Copiar link público
            </button>
          )}
          {podeGerenciar && (
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => abrirEdicaoPortaria(portaria)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
              {portaria.status !== 'revogada' && (
                <button
                  type="button"
                  onClick={() => handleExcluirOuRevogarPortaria(portaria)}
                  className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300"
                >
                  {portaria.publicado_at ? <ShieldOff className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                  {portaria.publicado_at ? 'Revogar' : 'Excluir'}
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transparência</h1>
          <p className="text-zinc-400 text-sm mt-1">Portarias e editais de credenciamento, por estado</p>
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="portarias">Portarias</TabsTrigger>
            <TabsTrigger value="editais">Editais</TabsTrigger>
          </TabsList>

          {/* ── ABA: PORTARIAS ── */}
          <TabsContent value="portarias" className="space-y-8 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-zinc-500 text-sm">Portarias publicadas via Criar Evento e Diários Oficiais monitorados</p>
              <div className="flex gap-2">
                <Dialog open={analyzeDialogOpen} onOpenChange={setAnalyzeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2">
                      <Sparkles className="h-4 w-4 text-secondary-400" />
                      Analisar com IA
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-2xl">
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
                        className="bg-zinc-800 border-zinc-700 text-white min-h-[160px]"
                      />
                      <Button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="bg-secondary-600 hover:bg-secondary-700 text-white w-full gap-2"
                      >
                        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {analyzing ? 'Analisando...' : 'Analisar'}
                      </Button>
                      {analysisResult && (
                        <div className="bg-zinc-800 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap border border-zinc-700">
                          {analysisResult}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {podeGerenciar && (
                  <Button onClick={() => navigate('/criar-evento')} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                    <Link2 className="h-4 w-4" />
                    Criar Evento
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar por título, conteúdo ou DETRAN..."
                  className="pl-9 bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <Button onClick={handleSearch} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>

            {statusFiltro && (
              <div className="flex items-center gap-2 text-sm bg-primary-500/10 border border-primary-500/20 rounded-lg px-4 py-2 w-fit">
                <span className="text-primary-300">
                  Filtrando por status: <span className="font-mono uppercase">{statusFiltro}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('status'); return p; })}
                  className="text-primary-400 hover:text-primary-200 underline text-xs"
                >
                  limpar
                </button>
              </div>
            )}

            {loadingPortarias ? (
              <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
                <span>Carregando portarias...</span>
              </div>
            ) : portariasFiltradas.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-12 w-12 text-zinc-700 mb-4" />
                  {statusFiltro ? (
                    <p className="text-zinc-400 font-medium mb-1">Nenhuma portaria com status "{statusFiltro}"</p>
                  ) : (
                    <>
                      <p className="text-zinc-400 font-medium mb-1">Nenhuma portaria cadastrada</p>
                      {podeGerenciar ? (
                        <>
                          <p className="text-zinc-600 text-sm mb-4">Crie um evento de credenciamento ou use o Querido Diário abaixo</p>
                          <Button onClick={() => navigate('/criar-evento')} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                            <Link2 className="h-4 w-4" />
                            Criar Evento
                          </Button>
                        </>
                      ) : (
                        <p className="text-zinc-600 text-sm">Use o Querido Diário abaixo para consultar Diários Oficiais</p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="space-y-2" value={ufsAbertas} onValueChange={setUfsAbertas}>
                {gruposPorUf.map(({ uf, nome, itens }) => (
                  <AccordionItem key={uf} value={uf} className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">
                          {uf === 'SEM_UF' ? 'SEM UF' : uf}
                        </Badge>
                        <span className="text-sm font-medium text-white">{nome}</span>
                        <span className="text-xs text-zinc-500">({itens.length})</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {itens.map((portaria) => renderPortariaCard(portaria))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            <div className="border-t border-zinc-800 pt-8">
              <QueridoDiarioBusca onPromover={podeGerenciar ? handlePromover : undefined} />
            </div>
          </TabsContent>

          {/* ── ABA: EDITAIS ── */}
          <TabsContent value="editais" className="mt-6">
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
              <p className="text-zinc-500 text-sm">Processos de credenciamento abertos pelos DETRANs</p>
              <div className="flex items-center gap-3">
                <Select value={filtroUF} onValueChange={setFiltroUF}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white w-36">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
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
                    <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editandoIdEdital ? 'Editar Edital' : 'Cadastrar Novo Edital'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSubmitEdital} className="space-y-4">
                        <div>
                          <Label className="text-zinc-300">Título</Label>
                          <Input value={formDataEdital.titulo} onChange={(e) => setFormDataEdital({ ...formDataEdital, titulo: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-zinc-300">UF</Label>
                            <Select value={formDataEdital.uf} onValueChange={(value) => setFormDataEdital({ ...formDataEdital, uf: value })}>
                              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-700 text-white max-h-64">
                                {UFS.map((uf) => (
                                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-zinc-300">Status</Label>
                            <Select value={formDataEdital.status} onValueChange={(value) => setFormDataEdital({ ...formDataEdital, status: value })}>
                              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                                <SelectItem value="aberto">Aberto</SelectItem>
                                <SelectItem value="encerrado">Encerrado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-zinc-300">Data de Encerramento</Label>
                          <Input type="date" value={formDataEdital.data_encerramento} onChange={(e) => setFormDataEdital({ ...formDataEdital, data_encerramento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Descrição</Label>
                          <Textarea value={formDataEdital.descricao} onChange={(e) => setFormDataEdital({ ...formDataEdital, descricao: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[100px]" />
                        </div>

                        <div>
                          <Label className="text-zinc-300">Documentos Obrigatórios</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              value={novoDocumento}
                              onChange={(e) => setNovoDocumento(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarDocumento(); } }}
                              placeholder="Ex: Contrato Social"
                              className="bg-zinc-800 border-zinc-700 text-white"
                            />
                            <Button type="button" onClick={adicionarDocumento} variant="outline" className="border-zinc-700 text-zinc-300 shrink-0">
                              Adicionar
                            </Button>
                          </div>
                          {formDataEdital.documentos_obrigatorios.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {formDataEdital.documentos_obrigatorios.map((doc, idx) => (
                                <Badge key={idx} className="bg-zinc-800 text-zinc-300 border-zinc-700 gap-1 pr-1">
                                  {doc}
                                  <button type="button" onClick={() => removerDocumento(idx)} className="ml-1 hover:text-red-400">
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="border-t border-zinc-800 pt-4">
                          <Label className="text-zinc-300">Anexos (PDF)</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <Input type="file" accept="application/pdf" onChange={handleAnexoUpload} disabled={enviandoAnexo} className="bg-zinc-800 border-zinc-700 text-white" />
                            {enviandoAnexo && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
                          </div>
                          {formDataEdital.anexos.length > 0 && (
                            <div className="space-y-1 mt-2">
                              {formDataEdital.anexos.map((a, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5">
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
                            <Input type="file" accept="application/pdf" onChange={handleTermoUpload} disabled={enviandoTermo} className="bg-zinc-800 border-zinc-700 text-white" />
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
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <Folder className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400">Nenhum edital encontrado</p>
                  {podeGerenciar ? (
                    <Button onClick={abrirNovoEdital} className="bg-primary-500 hover:bg-primary-600 text-white gap-2 mt-4">
                      <Plus className="h-4 w-4" />
                      Cadastrar Primeiro Edital
                    </Button>
                  ) : (
                    <p className="text-sm text-zinc-600 mt-1">Aguarde editais dos DETRANs</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <BentoGrid>
                {editaisFiltrados.map((edital) => {
                  const cfg = STATUS_EDITAL[edital.status] || STATUS_EDITAL.encerrado;
                  const Icon = cfg.icon;
                  const dias = Math.ceil((new Date(edital.data_encerramento) - new Date()) / (1000*60*60*24));
                  return (
                    <BentoCard key={edital.edital_id} size="2x1" interactive className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="p-6 h-full flex flex-col">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">DETRAN-{edital.uf}</Badge>
                            <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                              <Icon className="h-3 w-3 mr-1" />{cfg.label}
                            </Badge>
                            {Array.isArray(edital.anexos) && edital.anexos.length > 0 && (
                              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-mono text-xs">
                                {edital.anexos.length} anexo(s)
                              </Badge>
                            )}
                            {edital.termo_adesao_path && (
                              <Badge className="bg-secondary-500/10 text-secondary-400 border-secondary-500/20 font-mono text-xs">
                                Termo de adesão
                              </Badge>
                            )}
                          </div>
                          {podeGerenciar && (
                            <button
                              type="button"
                              onClick={() => abrirEdicaoEdital(edital)}
                              title="Editar"
                              className="text-zinc-500 hover:text-white shrink-0"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">{edital.titulo}</h3>
                        <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{edital.descricao}</p>
                        <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Encerra {new Date(edital.data_encerramento).toLocaleDateString('pt-BR')}</span>
                          {edital.status === 'aberto' && dias > 0 && (
                            <span className={`font-mono font-semibold ${dias <= 7 ? 'text-red-400' : dias <= 15 ? 'text-primary-400' : 'text-zinc-400'}`}>{dias} dias restantes</span>
                          )}
                        </div>
                        {!podeGerenciar && edital.status === 'aberto' && (
                          <Button onClick={() => handleCandidatar(edital)} className="bg-primary-500 hover:bg-primary-600 text-white text-sm h-9 px-4 mt-auto self-start">
                            Candidatar-se <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        )}
                      </CardContent>
                    </BentoCard>
                  );
                })}
              </BentoGrid>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialog: Editar Portaria ── */}
      <Dialog open={editDialogOpenPortaria} onOpenChange={setEditDialogOpenPortaria}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Portaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-300">Título</Label>
              <Input value={editDataPortaria.title} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, title: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Número da Portaria</Label>
                <Input value={editDataPortaria.numero} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, numero: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Órgão Emissor</Label>
                <Input value={editDataPortaria.orgao_emissor} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, orgao_emissor: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">UF (estado)</Label>
                <Input
                  value={editDataPortaria.estado_sigla}
                  onChange={(e) => setEditDataPortaria({ ...editDataPortaria, estado_sigla: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Status</Label>
                <Select value={editDataPortaria.status} onValueChange={(value) => setEditDataPortaria({ ...editDataPortaria, status: value })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectItem value="vigente">Vigente</SelectItem>
                    <SelectItem value="revogada">Revogada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Data</Label>
                <Input type="date" value={editDataPortaria.date} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Tipo</Label>
                <Select value={editDataPortaria.tipo} onValueChange={(value) => setEditDataPortaria({ ...editDataPortaria, tipo: value })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    {TIPOS_PORTARIA.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-300">Resumo</Label>
              <Textarea value={editDataPortaria.summary} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, summary: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[80px]" />
            </div>
            <div>
              <Label className="text-zinc-300">Link do PDF</Label>
              <Input value={editDataPortaria.link_pdf} onChange={(e) => setEditDataPortaria({ ...editDataPortaria, link_pdf: e.target.value })} placeholder="https://..." className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-zinc-500 shrink-0">ou envie o arquivo:</span>
                <Input type="file" accept="application/pdf" onChange={handleUploadPdfPortaria} disabled={enviandoPdfPortaria} className="bg-zinc-800 border-zinc-700 text-white" />
                {enviandoPdfPortaria && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
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
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Qual empresa está se candidatando?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Sua conta tem mais de uma empresa cadastrada. Selecione qual delas está se candidatando ao edital{editalParaCandidatar ? ` "${editalParaCandidatar.titulo}"` : ''}.
          </p>
          <Select value={empresaEscolhida} onValueChange={setEmpresaEscolhida}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
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
              className="bg-orange-500 hover:bg-orange-600 text-white"
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
