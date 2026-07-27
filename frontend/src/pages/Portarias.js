import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Search, Plus, FileText, Calendar, ExternalLink, Sparkles, Globe, Filter, ChevronDown, X, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Mapa de estados brasileiros com códigos IBGE
const ESTADOS_IBGE = [
  { sigla: 'AC', nome: 'Acre', codigo: '12' },
  { sigla: 'AL', nome: 'Alagoas', codigo: '27' },
  { sigla: 'AP', nome: 'Amapá', codigo: '16' },
  { sigla: 'AM', nome: 'Amazonas', codigo: '13' },
  { sigla: 'BA', nome: 'Bahia', codigo: '29' },
  { sigla: 'CE', nome: 'Ceará', codigo: '23' },
  { sigla: 'DF', nome: 'Distrito Federal', codigo: '53' },
  { sigla: 'ES', nome: 'Espírito Santo', codigo: '32' },
  { sigla: 'GO', nome: 'Goiás', codigo: '52' },
  { sigla: 'MA', nome: 'Maranhão', codigo: '21' },
  { sigla: 'MT', nome: 'Mato Grosso', codigo: '51' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', codigo: '50' },
  { sigla: 'MG', nome: 'Minas Gerais', codigo: '31' },
  { sigla: 'PA', nome: 'Pará', codigo: '15' },
  { sigla: 'PB', nome: 'Paraíba', codigo: '25' },
  { sigla: 'PR', nome: 'Paraná', codigo: '41' },
  { sigla: 'PE', nome: 'Pernambuco', codigo: '26' },
  { sigla: 'PI', nome: 'Piauí', codigo: '22' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', codigo: '33' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', codigo: '24' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', codigo: '43' },
  { sigla: 'RO', nome: 'Rondônia', codigo: '11' },
  { sigla: 'RR', nome: 'Roraima', codigo: '14' },
  { sigla: 'SC', nome: 'Santa Catarina', codigo: '42' },
  { sigla: 'SP', nome: 'São Paulo', codigo: '35' },
  { sigla: 'SE', nome: 'Sergipe', codigo: '28' },
  { sigla: 'TO', nome: 'Tocantins', codigo: '17' },
];

const TERMOS_SUGERIDOS = [
  'portaria credenciamento registradora',
  'CONTRAN 807',
  'registro de contratos veículos',
  'credenciamento DETRAN',
  'Portaria 1452',
  'alienação fiduciária',
];

const Portarias = () => {
  const { user, initialized, keycloak } = useAuth();

  // ── Portarias internas ──
  const [portarias, setPortarias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    source: '',
    detran: '',
    date: new Date().toISOString().split('T')[0],
  });

  // ── Querido Diário ──
  const [qdEstado, setQdEstado] = useState(ESTADOS_IBGE[5]); // Ceará padrão
  const [qdQuery, setQdQuery] = useState('portaria credenciamento registradora');
  const [qdDataInicio, setQdDataInicio] = useState('');
  const [qdDataFim, setQdDataFim] = useState('');
  const [qdResults, setQdResults] = useState(null);
  const [qdLoading, setQdLoading] = useState(false);
  const [qdError, setQdError] = useState('');
  const [qdFiltrosAbertos, setQdFiltrosAbertos] = useState(false);
  const [qdEstadoDropdown, setQdEstadoDropdown] = useState(false);

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
      setPortarias(response.data);
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
      setPortarias(response.data);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/portarias`, formData, { withCredentials: true });
      toast.success('Portaria cadastrada com sucesso!');
      setDialogOpen(false);
      fetchPortarias();
      setFormData({ title: '', content: '', source: '', detran: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error('Erro ao cadastrar portaria:', error);
      toast.error('Erro ao cadastrar portaria');
    }
  };

  // ── Busca Querido Diário ──
  const buscarQueridoDiario = async () => {
    if (!qdQuery.trim()) return;
    setQdLoading(true);
    setQdError('');
    try {
      const params = new URLSearchParams({
        territory_id: qdEstado.codigo,
        querystring: qdQuery,
        size: 10,
      });
      if (qdDataInicio) params.append('published_since', qdDataInicio);
      if (qdDataFim) params.append('published_until', qdDataFim);

      const response = await axios.get(
        `${API}/portarias/queridodiario?${params.toString()}`,
        { withCredentials: true }
      );
      setQdResults(response.data);
    } catch (err) {
      setQdError('Erro ao consultar o Querido Diário. Tente novamente.');
    } finally {
      setQdLoading(false);
    }
  };

  const limparFiltrosQD = () => {
    setQdDataInicio('');
    setQdDataFim('');
    setQdResults(null);
    setQdError('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">

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
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  Analisar com IA
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-400" />
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
                    className="bg-purple-600 hover:bg-purple-700 text-white w-full gap-2"
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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
                  <Plus className="h-4 w-4" />
                  Nova Portaria
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
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
                      <Label className="text-zinc-300">Fonte</Label>
                      <Input value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">DETRAN</Label>
                      <Input value={formData.detran} onChange={(e) => setFormData({ ...formData, detran: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Data</Label>
                    <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Conteúdo</Label>
                    <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[100px]" />
                  </div>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white w-full">
                    Cadastrar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
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
          <Button onClick={handleSearch} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>

        {/* ── Lista de Portarias Internas ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
            <span>Carregando portarias...</span>
          </div>
        ) : portarias.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-zinc-400 font-medium mb-1">Nenhuma portaria cadastrada</p>
              <p className="text-zinc-600 text-sm mb-4">Cadastre portarias ou use o Querido Diário abaixo</p>
              <Button onClick={() => setDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar Primeira Portaria
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {portarias.map((portaria) => (
              <Card key={portaria.portaria_id} className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold text-white mb-2">{portaria.title}</CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        {portaria.source && (
                          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 font-mono text-xs">
                            {portaria.source}
                          </Badge>
                        )}
                        {portaria.detran && (
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">
                            DETRAN {portaria.detran}
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* ── SEÇÃO: QUERIDO DIÁRIO ── */}
        {/* ══════════════════════════════════════════ */}
        <div className="border-t border-zinc-800 pt-8">

          {/* Cabeçalho da seção */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <Globe className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Querido Diário
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs font-normal">API Pública</Badge>
              </h2>
              <p className="text-sm text-zinc-400">Busca em Diários Oficiais brasileiros — Open Knowledge Brasil</p>
            </div>
          </div>

          {/* Painel de busca principal */}
          <Card className="bg-zinc-900/60 border-zinc-800 mb-4">
            <CardContent className="p-5 space-y-4">

              {/* Linha 1: Estado + Palavra-chave + Buscar */}
              <div className="flex flex-col sm:flex-row gap-3">

                {/* Seletor de Estado */}
                <div className="sm:w-56">
                  <Label className="text-zinc-400 text-xs mb-1.5 block">Estado</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setQdEstadoDropdown(!qdEstadoDropdown)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm hover:border-zinc-600 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-orange-400 font-mono font-bold text-xs">{qdEstado.sigla}</span>
                        <span className="text-zinc-300">{qdEstado.nome}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                    </button>
                    {qdEstadoDropdown && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-xl max-h-60 overflow-y-auto">
                        {ESTADOS_IBGE.map((estado) => (
                          <button
                            key={estado.sigla}
                            type="button"
                            onClick={() => { setQdEstado(estado); setQdEstadoDropdown(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-zinc-700 transition-colors ${qdEstado.sigla === estado.sigla ? 'bg-zinc-700' : ''}`}
                          >
                            <span className="text-orange-400 font-mono font-bold text-xs w-6">{estado.sigla}</span>
                            <span className="text-zinc-300">{estado.nome}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Campo de busca */}
                <div className="flex-1">
                  <Label className="text-zinc-400 text-xs mb-1.5 block">Palavra-chave</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <Input
                        value={qdQuery}
                        onChange={(e) => setQdQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && buscarQueridoDiario()}
                        placeholder="Ex: portaria credenciamento registradora"
                        className="pl-9 bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>
                    <Button
                      onClick={buscarQueridoDiario}
                      disabled={qdLoading}
                      className="bg-orange-500 hover:bg-orange-600 text-white gap-2 shrink-0"
                    >
                      {qdLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Search className="h-4 w-4" />}
                      {qdLoading ? 'Buscando...' : 'Buscar'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Filtros avançados (colapsáveis) */}
              <div>
                <button
                  type="button"
                  onClick={() => setQdFiltrosAbertos(!qdFiltrosAbertos)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtros avançados
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${qdFiltrosAbertos ? 'rotate-180' : ''}`} />
                </button>

                {qdFiltrosAbertos && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <Label className="text-zinc-400 text-xs mb-1.5 block">Publicado desde</Label>
                      <Input
                        type="date"
                        value={qdDataInicio}
                        onChange={(e) => setQdDataInicio(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-zinc-400 text-xs mb-1.5 block">Publicado até</Label>
                      <Input
                        type="date"
                        value={qdDataFim}
                        onChange={(e) => setQdDataFim(e.target.value)}
                        className="bg-zinc-800 border-zinc-700 text-white text-sm"
                      />
                    </div>
                    {(qdDataInicio || qdDataFim) && (
                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          onClick={limparFiltrosQD}
                          className="text-zinc-500 hover:text-zinc-300 gap-1 text-xs"
                        >
                          <X className="h-3.5 w-3.5" />
                          Limpar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sugestões de termos */}
              {!qdResults && !qdLoading && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-xs text-zinc-600 self-center">Sugestões:</span>
                  {TERMOS_SUGERIDOS.map((termo) => (
                    <button
                      key={termo}
                      type="button"
                      onClick={() => { setQdQuery(termo); }}
                      className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-orange-500/40 hover:text-orange-400 transition-colors"
                    >
                      {termo}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Erro */}
          {qdError && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {qdError}
            </div>
          )}

          {/* Resultados */}
          {qdResults && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  <span className="text-orange-400 font-semibold">{qdResults.total || 0}</span> resultado(s) em{' '}
                  <span className="text-zinc-300 font-medium">{qdEstado.nome}</span>{' '}
                  para <span className="text-zinc-300">"{qdQuery}"</span>
                </p>
                <button
                  type="button"
                  onClick={() => setQdResults(null)}
                  className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Limpar
                </button>
              </div>

              {qdResults.resultados && qdResults.resultados.length === 0 && (
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <BookOpen className="h-10 w-10 text-zinc-700 mb-3" />
                    <p className="text-zinc-400 font-medium mb-1">Nenhum resultado encontrado</p>
                    <p className="text-zinc-600 text-sm">
                      O Querido Diário pode não cobrir esse estado/município.<br />
                      Tente termos diferentes ou outro estado.
                    </p>
                  </CardContent>
                </Card>
              )}

              {qdResults.resultados && qdResults.resultados.map((item, idx) => (
                <Card
                  key={idx}
                  className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 font-mono text-xs">
                            <Calendar className="h-3 w-3 mr-1 inline" />
                            {new Date(item.date).toLocaleDateString('pt-BR')}
                          </Badge>
                          {item.edition && (
                            <Badge className="bg-zinc-700/50 text-zinc-300 border-zinc-600 font-mono text-xs">
                              Edição {item.edition}
                            </Badge>
                          )}
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">
                            {qdEstado.sigla}
                          </Badge>
                        </div>
                        {item.excerpts && item.excerpts.map((exc, i) => (
                          <p
                            key={i}
                            className="text-sm text-zinc-300 leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: exc.replace(
                                /<em>/g,
                                '<em class="text-orange-400 not-italic font-semibold bg-orange-500/10 px-0.5 rounded">'
                              )
                            }}
                          />
                        ))}
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 border border-orange-500/20 hover:border-orange-500/40 rounded-md px-2.5 py-1.5 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver PDF
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Portarias;
