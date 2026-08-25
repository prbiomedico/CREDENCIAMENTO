import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  CheckCircle, XCircle, Clock, Upload, FileText,
  ChevronDown, ChevronUp, Eye, AlertCircle, Send,
  ArrowLeft, Bell, RefreshCw
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'https://api.sigcr.com.br';

const STATUS_DOC = {
  pendente:    { label: 'Faltando Preencher', color: 'bg-zinc-800 text-zinc-400 border-zinc-700',     icon: Clock,       dot: 'bg-zinc-500' },
  em_analise:  { label: 'Em Anlise',         color: 'bg-blue-900/40 text-blue-400 border-blue-700',  icon: RefreshCw,   dot: 'bg-blue-400 animate-pulse' },
  aprovado:    { label: 'Aprovado',            color: 'bg-emerald-900/40 text-emerald-400 border-emerald-700', icon: CheckCircle, dot: 'bg-emerald-400' },
  reprovado:   { label: 'Reprovado',           color: 'bg-red-900/40 text-red-400 border-red-700',    icon: XCircle,     dot: 'bg-red-400' },
};

const RESPONSABILIDADE = {
  orgao:      { label: 'Responsabilidade do rgo', color: 'bg-secondary-900/30 text-secondary-400 border-secondary-700' },
  empresa:    { label: 'Empresa',                   color: 'bg-primary-900/30 text-primary-400 border-primary-700' },
};

export default function SolicitacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, initialized, getToken } = useAuth();
  const { toast } = useToast();
  const fileInputRefs = useRef({});

  const [solicitacao, setSolicitacao] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState({});
  const [uploading, setUploading] = useState({});
  const [motivoReprova, setMotivoReprova] = useState({});
  const [showMotivoInput, setShowMotivoInput] = useState({});

  useEffect(() => {
    if (!initialized || !user) return;
    fetchSolicitacao();
  }, [initialized, user, id]);

  const fetchSolicitacao = async () => {
    try {
      await getToken();
    } catch {}
    try {
      const [resSol, resDocs] = await Promise.all([
        axios.get(`${API}/solicitacoes/${id}`),
        axios.get(`${API}/solicitacoes/${id}/documentos`),
      ]);
      setSolicitacao(resSol.data);
      setDocumentos(resDocs.data || []);
    } catch (e) {
      toast.error('Erro ao carregar solicitao');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (docNome) =>
    setExpandido(p => ({ ...p, [docNome]: !p[docNome] }));

  const handleUpload = async (docNome, file) => {
    if (!file) return;
    setUploading(p => ({ ...p, [docNome]: true }));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('document_name', docNome);
    try {
      await axios.post(`${API}/solicitacoes/${id}/documentos/${encodeURIComponent(docNome)}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast({ title: ' Documento enviado', description: 'O analista foi notificado para reviso.' });
      await fetchSolicitacao();
    } catch (e) {
      toast({ title: 'Erro no upload', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setUploading(p => ({ ...p, [docNome]: false }));
    }
  };

  const handleAprovar = async (docNome) => {
    try {
      await axios.patch(`${API}/solicitacoes/${id}/documentos/${encodeURIComponent(docNome)}/status`, {
        status: 'aprovado', motivo: ''
      });
      toast({ title: ' Documento aprovado' });
      await fetchSolicitacao();
    } catch (e) {
      toast({ title: 'Erro', description: e.response?.data?.detail, variant: 'destructive' });
    }
  };

  const handleReprovar = async (docNome) => {
    const motivo = motivoReprova[docNome] || '';
    if (!motivo.trim()) {
      toast({ title: 'Informe o motivo da reprovao', variant: 'destructive' });
      return;
    }
    try {
      await axios.patch(`${API}/solicitacoes/${id}/documentos/${encodeURIComponent(docNome)}/status`, {
        status: 'reprovado', motivo
      });
      toast({ title: ' Documento reprovado', description: 'A empresa foi notificada.' });
      setShowMotivoInput(p => ({ ...p, [docNome]: false }));
      await fetchSolicitacao();
    } catch (e) {
      toast({ title: 'Erro', description: e.response?.data?.detail, variant: 'destructive' });
    }
  };

  const getDocStatus = (docNome) => {
    const doc = documentos.find(d => d.document_name === docNome);
    if (!doc) return 'pendente';
    return doc.status || 'pendente';
  };

  const getDocData = (docNome) => documentos.find(d => d.document_name === docNome);

  const isAnalista = user?.roles?.includes('detran_operator') || user?.roles?.includes('sigcr_admin');

  const totalDocs = solicitacao?.documentos_obrigatorios?.length || 0;
  const aprovados = solicitacao?.documentos_obrigatorios?.filter(d => getDocStatus(d) === 'aprovado').length || 0;
  const progresso = totalDocs > 0 ? Math.round((aprovados / totalDocs) * 100) : 0;

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </DashboardLayout>
  );

  if (!solicitacao) return (
    <DashboardLayout>
      <div className="p-8 text-zinc-400">Solicitao no encontrada.</div>
    </DashboardLayout>
  );

  const docsObrigatorios = Array.isArray(solicitacao.documentos_obrigatorios) ? solicitacao.documentos_obrigatorios : [];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/solicitacoes')}
            className="text-zinc-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{solicitacao.titulo || 'Solicitao de Credenciamento'}</h1>
            <p className="text-zinc-500 text-sm">DETRAN-{solicitacao.uf}  Solicitao #{id?.slice(0,8)}</p>
          </div>
          <Badge className="bg-primary-500/20 text-primary-400 border-primary-500/30 font-mono text-xs">
            {solicitacao.status?.toUpperCase() || 'EM ANLISE'}
          </Badge>
        </div>

        {/* Barra de progresso */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-400 font-medium">Progresso da Documentao</span>
              <span className="text-sm font-mono text-primary-400">{aprovados}/{totalDocs} aprovados</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-700"
                style={{
                  width: `${progresso}%`,
                  background: progresso === 100
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : 'linear-gradient(90deg, #f97316, #fb923c)'
                }}
              />
            </div>
            <div className="flex gap-4 mt-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>Aprovado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block"/>Em anlise</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Reprovado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-500 inline-block"/>Pendente</span>
            </div>
          </CardContent>
        </Card>

        {/* Checklist de documentos */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest px-1 mb-3">
            Documentao Necessria
          </h2>

          {docsObrigatorios.map((docNome, idx) => {
            const status = getDocStatus(docNome);
            const cfg = STATUS_DOC[status] || STATUS_DOC.pendente;
            const StatusIcon = cfg.icon;
            const docData = getDocData(docNome);
            const isOpen = expandido[docNome];
            const isUploading = uploading[docNome];
            const responsabilidade = docNome.toLowerCase().includes('prova de conceito')
              ? RESPONSABILIDADE.orgao : RESPONSABILIDADE.empresa;

            return (
              <Card key={docNome}
                className={`border transition-all duration-200 ${
                  status === 'aprovado' ? 'border-emerald-800/50 bg-zinc-900/30' :
                  status === 'reprovado' ? 'border-red-800/50 bg-zinc-900/30' :
                  status === 'em_analise' ? 'border-blue-800/50 bg-zinc-900/30' :
                  'border-zinc-800 bg-zinc-900/50'
                }`}>

                {/* Item header clicvel */}
                <button
                  onClick={() => toggleExpand(docNome)}
                  className="w-full text-left p-4 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <span className="flex-1 text-sm font-medium text-white uppercase tracking-wide">
                    {docNome}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs border ${cfg.color} flex items-center gap-1`}>
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </Badge>
                    <Badge className={`text-xs border ${responsabilidade.color} hidden sm:flex`}>
                      {responsabilidade.label}
                    </Badge>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                  </div>
                </button>

                {/* Painel expandido */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">

                    {/* Arquivo atual */}
                    {docData?.file_name && (
                      <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                        <span className="text-sm text-zinc-300 flex-1 truncate">{docData.file_name}</span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {docData.file_size ? `${(docData.file_size / 1024).toFixed(1)} KB` : ''}
                        </span>
                        <Button variant="ghost" size="sm"
                          className="text-blue-400 hover:text-blue-300 h-7 px-2"
                          onClick={() => window.open(`${API}/solicitacoes/${id}/documentos/${encodeURIComponent(docNome)}/download`, '_blank')}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                        </Button>
                      </div>
                    )}

                    {/* Motivo reprovao */}
                    {status === 'reprovado' && docData?.motivo && (
                      <div className="flex items-start gap-2 p-3 bg-red-900/20 rounded-lg border border-red-800/50">
                        <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-red-400 font-semibold mb-1">Motivo da reprovao</p>
                          <p className="text-sm text-red-300">{docData.motivo}</p>
                        </div>
                      </div>
                    )}

                    {/* Aes da REGISTRADORA */}
                    {!isAnalista && (status === 'pendente' || status === 'reprovado') && (
                      <div>
                        <input
                          type="file"
                          ref={el => fileInputRefs.current[docNome] = el}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.jpg,.png"
                          onChange={e => handleUpload(docNome, e.target.files[0])}
                        />
                        <Button
                          onClick={() => fileInputRefs.current[docNome]?.click()}
                          disabled={isUploading}
                          className="bg-primary-500 hover:bg-primary-600 text-white w-full sm:w-auto">
                          {isUploading ? (
                            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
                          ) : (
                            <><Upload className="h-4 w-4 mr-2" />
                              {status === 'reprovado' ? 'Reenviar Documento' : 'Anexar Documento'}
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-zinc-500 mt-1">Formatos aceitos: PDF, DOC, DOCX, JPG, PNG</p>
                      </div>
                    )}

                    {/* Aes do ANALISTA */}
                    {isAnalista && status === 'em_analise' && (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            onClick={() => handleAprovar(docNome)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            <CheckCircle className="h-4 w-4 mr-2" /> Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setShowMotivoInput(p => ({ ...p, [docNome]: !p[docNome] }))}
                            className="border-red-700 text-red-400 hover:bg-red-900/30">
                            <XCircle className="h-4 w-4 mr-2" /> Reprovar
                          </Button>
                        </div>
                        {showMotivoInput[docNome] && (
                          <div className="space-y-2">
                            <textarea
                              placeholder="Informe o motivo da reprovao para a empresa..."
                              value={motivoReprova[docNome] || ''}
                              onChange={e => setMotivoReprova(p => ({ ...p, [docNome]: e.target.value }))}
                              className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 resize-none"
                              rows={3}
                            />
                            <Button
                              onClick={() => handleReprovar(docNome)}
                              className="bg-red-600 hover:bg-red-700 text-white w-full">
                              <Send className="h-4 w-4 mr-2" /> Confirmar Reprovao e Notificar Empresa
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status info */}
                    {status === 'em_analise' && !isAnalista && (
                      <div className="flex items-center gap-2 text-sm text-blue-400">
                        <Bell className="h-4 w-4" />
                        <span>Documento em reviso pelo analista. Voc ser notificado ao concluir.</span>
                      </div>
                    )}
                    {status === 'aprovado' && (
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle className="h-4 w-4" />
                        <span>Documento aprovado.</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Rodap de ao */}
        {progresso === 100 && !isAnalista && (
          <Card className="border-emerald-700/50 bg-emerald-900/20">
            <CardContent className="p-5 flex items-center gap-4">
              <CheckCircle className="h-8 w-8 text-emerald-400 shrink-0" />
              <div>
                <p className="text-white font-semibold">Toda a documentao foi aprovada!</p>
                <p className="text-emerald-400 text-sm">Aguarde a homologao final pelo DETRAN.</p>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
