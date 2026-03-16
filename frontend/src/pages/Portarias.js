import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Search, Sparkles, Plus, FileText, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Portarias = () => {
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
    date: new Date().toISOString().split('T')[0],
    detran: '',
  });

  useEffect(() => {
    fetchPortarias();
  }, []);

  const fetchPortarias = async () => {
    try {
      const response = await axios.get(`${API}/portarias`, { withCredentials: true });
      setPortarias(response.data);
    } catch (error) {
      console.error('Error fetching portarias:', error);
      toast.error('Erro ao carregar portarias');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchPortarias();
      return;
    }
    try {
      const response = await axios.get(`${API}/portarias/search?q=${encodeURIComponent(searchQuery)}`, {
        withCredentials: true,
      });
      setPortarias(response.data);
    } catch (error) {
      console.error('Error searching portarias:', error);
      toast.error('Erro ao buscar portarias');
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeText.trim()) {
      toast.error('Digite o texto para análise');
      return;
    }
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
      console.error('Error analyzing portaria:', error);
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
      setFormData({
        title: '',
        content: '',
        source: '',
        date: new Date().toISOString().split('T')[0],
        detran: '',
      });
      fetchPortarias();
    } catch (error) {
      console.error('Error creating portaria:', error);
      toast.error('Erro ao cadastrar portaria');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="portarias-page">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Portarias</h1>
          <p className="text-zinc-400">Busque e analise portarias dos Diários Oficiais</p>
        </div>

        {/* Search Bar */}
        <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  data-testid="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar por título, conteúdo ou DETRAN..."
                  className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white h-14 text-base"
                />
              </div>
              <Button
                data-testid="search-btn"
                onClick={handleSearch}
                className="bg-orange-500 hover:bg-orange-600 text-white button-shadow h-14 px-8"
              >
                <Search className="h-5 w-5 mr-2" />
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 mb-8">
          <Dialog open={analyzeDialogOpen} onOpenChange={setAnalyzeDialogOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="analyze-btn"
                className="bg-purple-600 hover:bg-purple-700 text-white button-shadow"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Analisar com IA
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Analisar Portaria com IA</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label className="text-zinc-300">Texto da Portaria</Label>
                  <Textarea
                    data-testid="analyze-text-input"
                    value={analyzeText}
                    onChange={(e) => setAnalyzeText(e.target.value)}
                    placeholder="Cole o texto da portaria aqui para análise..."
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2 min-h-[200px]"
                  />
                </div>
                <Button
                  data-testid="analyze-submit-btn"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white button-shadow"
                >
                  {analyzing ? 'Analisando...' : 'Analisar'}
                </Button>
                {analysisResult && (
                  <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <h3 className="font-semibold mb-2 text-orange-500">Resultado da Análise:</h3>
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap">{analysisResult}</pre>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="new-portaria-btn"
                className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Portaria
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Cadastrar Nova Portaria</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <Label className="text-zinc-300">Título</Label>
                  <Input
                    data-testid="portaria-title-input"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <div>
                  <Label className="text-zinc-300">Conteúdo</Label>
                  <Textarea
                    data-testid="portaria-content-input"
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2 min-h-[150px]"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Fonte</Label>
                    <Input
                      data-testid="portaria-source-input"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="DOU, DODF, etc."
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300">DETRAN</Label>
                    <Input
                      data-testid="portaria-detran-input"
                      value={formData.detran}
                      onChange={(e) => setFormData({ ...formData, detran: e.target.value })}
                      placeholder="SP, RJ, MG, etc."
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-300">Data</Label>
                  <Input
                    data-testid="portaria-date-input"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <Button
                  data-testid="submit-portaria-btn"
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white button-shadow"
                >
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Portarias List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-zinc-400">Carregando portarias...</p>
          </div>
        ) : portarias.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-4">Nenhuma portaria encontrada</p>
              <Button
                data-testid="empty-state-add-portaria-btn"
                onClick={() => setDialogOpen(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Cadastrar Primeira Portaria
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {portarias.map((portaria) => (
              <Card
                key={portaria.portaria_id}
                data-testid={`portaria-card-${portaria.portaria_id}`}
                className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold mb-2">{portaria.title}</CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 font-mono text-xs">
                          {portaria.source}
                        </Badge>
                        {portaria.detran && (
                          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-mono text-xs">
                            DETRAN {portaria.detran}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Calendar className="h-4 w-4" />
                      {new Date(portaria.date).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-400 line-clamp-3">
                    {portaria.summary || portaria.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Portarias;