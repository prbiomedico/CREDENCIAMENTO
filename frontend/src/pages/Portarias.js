import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Search, Plus, FileText, Calendar, ExternalLink, Sparkles, Loader2, X, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import QueridoDiarioBusca from '../components/QueridoDiarioBusca';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const TIPOS_PORTARIA = [
  { value: 'credenciamento', label: 'Credenciamento' },
  { value: 'descredenciamento', label: 'Descredenciamento' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'outro', label: 'Outro' },
];

const emptyFormData = () => ({
  title: '',
  content: '',
  source: '',
  detran: '',
  date: new Date().toISOString().split('T')[0],
  numero: '',
  orgao_emissor: '',
  estado_sigla: '',
  status: 'vigente',
  link_pdf: '',
  origem: 'manual',
  querido_diario_url: '',
  summary: '',
  tipo: '',
});

const Portarias = () => {
  const { user, initialized, keycloak } = useAuth();

  // Cadastro de portaria é restrito a sigcr_admin/detran/detran_admin — a
  // registradora só pode visualizar (ex: pra saber se está credenciada em
  // algum estado), nunca cadastrar. Espelha o require_perfil do backend em
  // POST /portarias e /portarias/upload.
  const podeCadastrar = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil);

  // ── Portarias internas ──
  const [portarias, setPortarias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [formData, setFormData] = useState(emptyFormData());
  const [anexarArquivo, setAnexarArquivo] = useState(false);
  const [arquivoPdf, setArquivoPdf] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState([]);

  // ── Checklist de exigências (fluxo de credenciamento por portaria) ──
  const [checklistItens, setChecklistItens] = useState([]);
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemDescricao, setNovoItemDescricao] = useState('');
  const [novoItemPerfil, setNovoItemPerfil] = useState('registradora');

  const adicionarItemChecklist = () => {
    if (!novoItemNome.trim()) { toast.error('Informe o nome do item do checklist'); return; }
    setChecklistItens((prev) => [
      ...prev,
      { nome: novoItemNome.trim(), descricao: novoItemDescricao.trim() || null, perfil_alvo: novoItemPerfil },
    ]);
    setNovoItemNome('');
    setNovoItemDescricao('');
  };

  const removerItemChecklist = (index) => {
    setChecklistItens((prev) => prev.filter((_, i) => i !== index));
  };

  const getToken = async () => {
    if (keycloak && keycloak.token) {
      if (keycloak.isTokenExpired(30)) {
        await keycloak.updateToken(30);
      }
    }
  };

  const fetchCompanies = async () => {
    try {
      // Portarias referenciam empresas credenciadas (registradora) — financeira
      // não participa desse fluxo, independente do badge/perfil ativo do usuário.
      const response = await axios.get(`${API}/companies`, {
        withCredentials: true,
        params: { tipo_empresa: 'registradora' },
      });
      setCompanies(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  };

  const toggleEmpresaReferenciada = (companyId) => {
    setEmpresasSelecionadas((prev) =>
      prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [...prev, companyId]
    );
  };

  useEffect(() => {
    if (!initialized || !user) return;
    fetchPortarias();
    fetchCompanies();
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

  const resetFormData = () => {
    setFormData(emptyFormData());
    setAnexarArquivo(false);
    setArquivoPdf(null);
    setEmpresasSelecionadas([]);
    setChecklistItens([]);
    setNovoItemNome('');
    setNovoItemDescricao('');
    setNovoItemPerfil('registradora');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (anexarArquivo && !arquivoPdf) {
      toast.error('Selecione o arquivo PDF ou desmarque "Anexar PDF"');
      return;
    }
    setSalvando(true);
    try {
      if (anexarArquivo) {
        const fd = new FormData();
        fd.append('title', formData.title);
        fd.append('content', formData.content);
        fd.append('source', formData.source || 'Manual');
        fd.append('date', formData.date);
        if (formData.detran) fd.append('detran', formData.detran);
        if (formData.numero) fd.append('numero', formData.numero);
        if (formData.orgao_emissor) fd.append('orgao_emissor', formData.orgao_emissor);
        if (formData.estado_sigla) fd.append('estado_sigla', formData.estado_sigla);
        fd.append('status', formData.status);
        if (formData.summary) fd.append('summary', formData.summary);
        fd.append('origem', formData.origem);
        if (formData.querido_diario_url) fd.append('querido_diario_url', formData.querido_diario_url);
        if (formData.tipo) fd.append('tipo', formData.tipo);
        if (empresasSelecionadas.length > 0) fd.append('empresas_referenciadas', JSON.stringify(empresasSelecionadas));
        if (checklistItens.length > 0) fd.append('checklist_itens', JSON.stringify(checklistItens));
        fd.append('file', arquivoPdf);
        await axios.post(`${API}/portarias/upload`, fd, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await axios.post(`${API}/portarias`, {
          ...formData, empresas_referenciadas: empresasSelecionadas, checklist_itens: checklistItens,
        }, { withCredentials: true });
      }
      toast.success('Portaria cadastrada com sucesso!');
      setDialogOpen(false);
      fetchPortarias();
      resetFormData();
    } catch (error) {
      console.error('Erro ao cadastrar portaria:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao cadastrar portaria');
    } finally {
      setSalvando(false);
    }
  };

  // Pré-preenche o cadastro a partir de uma sugestão do Querido Diário — o
  // usuário ainda precisa revisar e clicar em "Cadastrar", nada é salvo sozinho.
  const handlePromover = (item, estadoSigla) => {
    const primeiroExcerto = (item.excerpts && item.excerpts[0]) || '';
    const textoLimpo = primeiroExcerto.replace(/<[^>]+>/g, '');
    setFormData({
      title: '',
      content: textoLimpo,
      source: 'Querido Diário',
      detran: estadoSigla,
      date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
      numero: '',
      orgao_emissor: '',
      estado_sigla: estadoSigla,
      status: 'vigente',
      link_pdf: item.url || '',
      origem: 'querido_diario',
      querido_diario_url: item.url || '',
      summary: textoLimpo,
      tipo: '',
    });
    setAnexarArquivo(false);
    setArquivoPdf(null);
    setEmpresasSelecionadas([]);
    setDialogOpen(true);
    toast.info('Revise os dados e confirme o cadastro da portaria.');
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

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Portarias</h1>
            <p className="text-zinc-400 text-sm mt-1">Gerencie e monitore portarias dos Diários Oficiais</p>
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

            {podeCadastrar && (
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetFormData(); }}>
              <DialogTrigger asChild>
                <Button className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Portaria
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Cadastrar Nova Portaria</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className="text-zinc-300">Título</Label>
                    <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-300">Número da Portaria</Label>
                      <Input value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} placeholder="Ex: 1.452/2026" className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Órgão Emissor</Label>
                      <Input value={formData.orgao_emissor} onChange={(e) => setFormData({ ...formData, orgao_emissor: e.target.value })} placeholder="Ex: DETRAN-SP" className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-300">Fonte</Label>
                      <Input value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">DETRAN</Label>
                      <Input value={formData.detran} onChange={(e) => setFormData({ ...formData, detran: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-300">UF (estado)</Label>
                      <Input
                        value={formData.estado_sigla}
                        onChange={(e) => setFormData({ ...formData, estado_sigla: e.target.value.toUpperCase().slice(0, 2) })}
                        placeholder="Ex: SP"
                        maxLength={2}
                        className="bg-zinc-800 border-zinc-700 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
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
                      <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Tipo</Label>
                      <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
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
                    <Label className="text-zinc-300">Conteúdo</Label>
                    <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[100px]" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Empresa(s) credenciada(s) referenciada(s)</Label>
                    <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                      {companies.length === 0 ? (
                        <p className="text-xs text-zinc-500 px-1 py-1">Nenhuma empresa disponível</p>
                      ) : (
                        companies.map((c) => (
                          <label key={c.company_id} className="flex items-center gap-2 px-1 py-1 text-sm text-zinc-300 hover:bg-zinc-700/50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={empresasSelecionadas.includes(c.company_id)}
                              onChange={() => toggleEmpresaReferenciada(c.company_id)}
                              className="rounded border-zinc-600"
                            />
                            {c.nome_fantasia || c.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 pt-4">
                    <Label className="text-zinc-300 flex items-center gap-2 mb-2">
                      <ListChecks className="h-4 w-4 text-primary-400" />
                      Checklist de exigências (credenciamento)
                    </Label>
                    <p className="text-xs text-zinc-500 mb-3">
                      Itens que a Registradora e/ou as Financeiras vão precisar enviar em resposta a esta portaria.
                    </p>

                    {checklistItens.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {checklistItens.map((item, index) => (
                          <div key={index} className="flex items-start gap-2 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2">
                            <Badge className={item.perfil_alvo === 'registradora'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs shrink-0'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs shrink-0'}>
                              {item.perfil_alvo === 'registradora' ? 'Registradora' : 'Financeira'}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 truncate">{item.nome}</p>
                              {item.descricao && <p className="text-xs text-zinc-500 truncate">{item.descricao}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => removerItemChecklist(index)}
                              className="text-zinc-500 hover:text-red-400 shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <Label className="text-zinc-400 text-xs">Nome do item</Label>
                        <Input
                          value={novoItemNome}
                          onChange={(e) => setNovoItemNome(e.target.value)}
                          placeholder="Ex: Certidão Negativa Federal"
                          className="bg-zinc-800 border-zinc-700 text-white mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Perfil</Label>
                        <Select value={novoItemPerfil} onValueChange={setNovoItemPerfil}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                            <SelectItem value="registradora">Registradora</SelectItem>
                            <SelectItem value="financeira">Financeira</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" onClick={adicionarItemChecklist} className="bg-zinc-700 hover:bg-zinc-600 text-white gap-1 shrink-0">
                        <Plus className="h-4 w-4" />
                        Item
                      </Button>
                    </div>
                    <Input
                      value={novoItemDescricao}
                      onChange={(e) => setNovoItemDescricao(e.target.value)}
                      placeholder="Descrição (opcional)"
                      className="bg-zinc-800 border-zinc-700 text-white mt-2"
                    />
                  </div>

                  <div className="border-t border-zinc-800 pt-4">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={anexarArquivo}
                        onChange={(e) => setAnexarArquivo(e.target.checked)}
                        className="rounded border-zinc-700"
                      />
                      Anexar PDF (upload real, em vez de só um link)
                    </label>
                    {anexarArquivo ? (
                      <Input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setArquivoPdf(e.target.files?.[0] || null)}
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    ) : (
                      <div>
                        <Label className="text-zinc-300">Link do PDF (opcional)</Label>
                        <Input
                          value={formData.link_pdf}
                          onChange={(e) => setFormData({ ...formData, link_pdf: e.target.value })}
                          placeholder="https://..."
                          className="bg-zinc-800 border-zinc-700 text-white mt-1"
                        />
                      </div>
                    )}
                  </div>

                  <Button type="submit" disabled={salvando} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
                    {salvando ? 'Cadastrando...' : 'Cadastrar'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
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

        {/* ── Lista de Portarias Internas ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando portarias...</span>
          </div>
        ) : portarias.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-zinc-400 font-medium mb-1">Nenhuma portaria cadastrada</p>
              {podeCadastrar ? (
                <>
                  <p className="text-zinc-600 text-sm mb-4">Cadastre portarias ou use o Querido Diário abaixo</p>
                  <Button onClick={() => setDialogOpen(true)} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Cadastrar Primeira Portaria
                  </Button>
                </>
              ) : (
                <p className="text-zinc-600 text-sm">Use o Querido Diário abaixo para consultar Diários Oficiais</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {portarias.map((portaria) => (
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
                  {portaria.link_pdf && (
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(portaria)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver PDF
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── SEÇÃO: QUERIDO DIÁRIO ── */}
        <div className="border-t border-zinc-800 pt-8">
          <QueridoDiarioBusca onPromover={podeCadastrar ? handlePromover : undefined} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Portarias;
