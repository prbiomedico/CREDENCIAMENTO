import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Search, FileText, Calendar, ExternalLink, Sparkles, Loader2, Pencil, Trash2, ShieldOff, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import QueridoDiarioBusca, { ESTADOS_IBGE } from '../components/QueridoDiarioBusca';
import ChecklistCatalogoPicker from '../components/ChecklistCatalogoPicker';

// Agrupamento de apresentação (não mexe em vínculo/hierarquia de aditivo —
// isso é funcionalidade futura separada, ver PENDING_ACTIONS.md). Reaproveita
// a mesma lista de UFs que o Querido Diário já usa, na mesma ordem regional.
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

const TIPOS_PORTARIA = [
  { value: 'credenciamento', label: 'Credenciamento' },
  { value: 'descredenciamento', label: 'Descredenciamento' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'outro', label: 'Outro' },
];

const emptyEditData = () => ({
  title: '', numero: '', orgao_emissor: '', estado_sigla: '', tipo: '',
  date: new Date().toISOString().split('T')[0], status: 'vigente',
  summary: '', link_pdf: '',
});

const Portarias = () => {
  const { user, initialized, keycloak } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFiltro = searchParams.get('status'); // ex: ?status=vigente, vindo do card "Portarias" do Dashboard

  // Cadastro de portaria saiu daqui — quem cria é o wizard "Criar Evento"
  // (/criar-evento). Aqui sobra visualização + edição de campos administrativos
  // + revogar/excluir. Espelha o require_perfil do backend em PATCH/DELETE /portarias.
  const podeGerenciar = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil);

  const [portarias, setPortarias] = useState([]);
  const portariasFiltradas = React.useMemo(
    () => (statusFiltro ? portarias.filter((p) => p.status === statusFiltro) : portarias),
    [portarias, statusFiltro]
  );
  const gruposPorUf = React.useMemo(() => agruparPorUf(portariasFiltradas), [portariasFiltradas]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // ── Editar (dialog leve) ──
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editData, setEditData] = useState(emptyEditData());
  const [editChecklistSelecionados, setEditChecklistSelecionados] = useState(new Set());
  const [editChecklistItens, setEditChecklistItens] = useState([]); // itens completos (nome/descricao/perfil_alvo/catalogo_item_id)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

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
  }, [initialized, user]);

  const fetchPortarias = async () => {
    setLoading(true);
    try {
      await getToken();
      const response = await axios.get(`${API}/portarias`, { withCredentials: true });
      setPortarias(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar portarias:', error);
      toast.error('Erro ao carregar portarias');
    } finally {
      setLoading(false);
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
      console.error('Erro ao buscar portarias:', error);
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
      console.error('Erro ao analisar portaria:', error);
      toast.error('Erro ao analisar portaria');
    } finally {
      setAnalyzing(false);
    }
  };

  // Deep-link pro wizard "Criar Evento" — o achado do Diário Oficial vira
  // pré-preenchimento do passo Detalhes; o usuário revisa e conclui lá,
  // não existe mais cadastro direto nesta tela.
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
      console.error('Erro ao baixar PDF da portaria:', error);
      toast.error('Erro ao baixar PDF da portaria');
    }
  };

  const abrirEdicao = (portaria) => {
    setEditandoId(portaria.portaria_id);
    setEditData({
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
    setEditDialogOpen(true);
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

  const salvarEdicao = async () => {
    if (!editData.title.trim()) { toast.error('Informe o título'); return; }
    setSalvandoEdicao(true);
    try {
      await axios.patch(`${API}/portarias/${editandoId}`, {
        ...editData,
        checklist_itens: editChecklistItens,
      }, { withCredentials: true });
      toast.success('Portaria atualizada');
      setEditDialogOpen(false);
      fetchPortarias();
    } catch (error) {
      console.error('Erro ao atualizar portaria:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar portaria');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Portaria já publicada (pelo wizard) preserva o registro histórico —
  // "excluir" vira revogar. Rascunho ou portaria cadastrada manualmente
  // (nunca teve ciclo de publicação) segue com exclusão de fato.
  const handleExcluirOuRevogar = async (portaria) => {
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
    <Card key={portaria.portaria_id} className="bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors">
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
                onClick={() => abrirEdicao(portaria)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
              {portaria.status !== 'revogada' && (
                <button
                  type="button"
                  onClick={() => handleExcluirOuRevogar(portaria)}
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

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Portarias</h1>
            <p className="text-zinc-400 text-sm mt-1">Portarias publicadas via Criar Evento e Diários Oficiais monitorados</p>
          </div>
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

        {/* ── Busca Interna ── */}
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

        {/* ── Filtro ativo (deep-link, ex: card "Portarias" do Dashboard) ── */}
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

        {/* ── Lista de Portarias ── */}
        {loading ? (
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
          <Accordion type="multiple" className="space-y-2">
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

        {/* ── SEÇÃO: QUERIDO DIÁRIO ── */}
        <div className="border-t border-zinc-800 pt-8">
          <QueridoDiarioBusca onPromover={podeGerenciar ? handlePromover : undefined} />
        </div>
      </div>

      {/* ── Dialog: Editar Portaria ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Portaria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-zinc-300">Título</Label>
              <Input value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Número da Portaria</Label>
                <Input value={editData.numero} onChange={(e) => setEditData({ ...editData, numero: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Órgão Emissor</Label>
                <Input value={editData.orgao_emissor} onChange={(e) => setEditData({ ...editData, orgao_emissor: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">UF (estado)</Label>
                <Input
                  value={editData.estado_sigla}
                  onChange={(e) => setEditData({ ...editData, estado_sigla: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Status</Label>
                <Select value={editData.status} onValueChange={(value) => setEditData({ ...editData, status: value })}>
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
                <Input type="date" value={editData.date} onChange={(e) => setEditData({ ...editData, date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Tipo</Label>
                <Select value={editData.tipo} onValueChange={(value) => setEditData({ ...editData, tipo: value })}>
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
              <Textarea value={editData.summary} onChange={(e) => setEditData({ ...editData, summary: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[80px]" />
            </div>
            <div>
              <Label className="text-zinc-300">Link do PDF</Label>
              <Input value={editData.link_pdf} onChange={(e) => setEditData({ ...editData, link_pdf: e.target.value })} placeholder="https://..." className="bg-zinc-800 border-zinc-700 text-white mt-1" />
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <Label className="text-zinc-300 mb-2 block">Checklist de exigências</Label>
              <ChecklistCatalogoPicker selecionados={editChecklistSelecionados} onToggle={toggleEditChecklistItem} />
            </div>

            <Button onClick={salvarEdicao} disabled={salvandoEdicao} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
              {salvandoEdicao ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Portarias;
