import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  FileText, Upload, Loader2, CheckCircle, Clock, XCircle, AlertTriangle,
  Download, ListChecks, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_SUBMISSAO_CFG = {
  rascunho: { label: 'Rascunho', className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  submetido: { label: 'Submetido', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  em_analise: { label: 'Em Análise', icon: Clock, className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  em_diligencia: { label: 'Em Diligência', icon: AlertTriangle, className: 'bg-primary-500/10 text-primary-400 border-primary-500/20' },
  homologado: { label: 'Homologado', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
};

const STATUS_ITEM_CFG = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  enviado: { label: 'Enviado', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  conforme: { label: 'Conforme', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  inconforme: { label: 'Inconforme', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

const MinhasSubmissoes = () => {
  const { user, initialized } = useAuth();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState(null);
  const [portarias, setPortarias] = useState([]);
  const [submissoes, setSubmissoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portariaAtiva, setPortariaAtiva] = useState(null);
  const [criandoSubmissao, setCriandoSubmissao] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [itemUpload, setItemUpload] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fetchTudo = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const companiesRes = await axios.get(`${API}/companies`, {
        withCredentials: true,
        params: { tipo_empresa: user.perfil },
      });
      const minhaEmpresa = (Array.isArray(companiesRes.data) ? companiesRes.data : [])[0] || null;
      setCompany(minhaEmpresa);
      if (!minhaEmpresa) { setPortarias([]); setSubmissoes([]); return; }

      const [portariasRes, submissoesRes] = await Promise.all([
        axios.get(`${API}/portarias`, { withCredentials: true }),
        axios.get(`${API}/submissoes`, { withCredentials: true }),
      ]);
      const atuacao = minhaEmpresa.detrans_atuacao || [];
      const relevantes = (Array.isArray(portariasRes.data) ? portariasRes.data : []).filter((p) =>
        p.estado_sigla && atuacao.includes(p.estado_sigla) &&
        (p.checklist_itens || []).some((i) => i.perfil_alvo === minhaEmpresa.tipo_empresa)
      );
      setPortarias(relevantes);
      setSubmissoes(Array.isArray(submissoesRes.data) ? submissoesRes.data : []);
    } catch (error) {
      console.error('Erro ao carregar submissões:', error);
      toast.error('Erro ao carregar credenciamento por portaria');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (initialized) fetchTudo(); }, [initialized, fetchTudo]);

  // Deep-link vindo de uma notificação ("checklist_inconforme"/"submissao_homologada",
  // que carregam submissao_id, ou um link direto por portaria_id) — pré-seleciona
  // a portaria certa assim que a lista carregar. Sem efeito se o id não existir
  // na lista (portaria/submissão de outra UF/perfil, notificação stale etc.).
  useEffect(() => {
    if (loading || portariaAtiva) return;
    const submissaoIdParam = searchParams.get('submissao_id');
    const portariaIdParam = searchParams.get('portaria_id');
    if (submissaoIdParam) {
      const sub = submissoes.find((s) => s.submissao_id === submissaoIdParam);
      if (sub) setPortariaAtiva(sub.portaria_id);
    } else if (portariaIdParam) {
      if (portarias.some((p) => p.portaria_id === portariaIdParam)) setPortariaAtiva(portariaIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, portarias, submissoes]);

  const submissaoDe = (portariaId) => submissoes.find((s) => s.portaria_id === portariaId) || null;

  const iniciarSubmissao = async (portariaId) => {
    setCriandoSubmissao(true);
    try {
      const res = await axios.post(`${API}/submissoes`, null, {
        withCredentials: true,
        params: { portaria_id: portariaId },
      });
      setSubmissoes((prev) => [...prev.filter((s) => s.submissao_id !== res.data.submissao_id), res.data]);
      setPortariaAtiva(portariaId);
    } catch (error) {
      console.error('Erro ao iniciar submissão:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao iniciar submissão');
    } finally {
      setCriandoSubmissao(false);
    }
  };

  const abrirUpload = (item) => {
    setItemUpload(item);
    setArquivo(null);
    setNumeroDocumento('');
    setDataEmissao('');
    setDataValidade('');
  };

  const enviarItem = async (e) => {
    e.preventDefault();
    const submissao = submissaoDe(portariaAtiva);
    if (!arquivo || !itemUpload || !submissao) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('numero_documento', numeroDocumento);
      fd.append('data_emissao', dataEmissao);
      if (dataValidade) fd.append('data_validade', dataValidade);
      fd.append('file', arquivo);
      const res = await axios.post(
        `${API}/submissoes/${submissao.submissao_id}/itens/${itemUpload.item_id}/upload`,
        fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setSubmissoes((prev) => prev.map((s) => (s.submissao_id === res.data.submissao_id ? res.data : s)));
      toast.success('Documento enviado');
      setItemUpload(null);
    } catch (error) {
      console.error('Erro ao enviar documento:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao enviar documento');
    } finally {
      setEnviando(false);
    }
  };

  const submeter = async (submissaoId) => {
    setSubmetendo(true);
    try {
      const res = await axios.post(`${API}/submissoes/${submissaoId}/submeter`, null, { withCredentials: true });
      setSubmissoes((prev) => prev.map((s) => (s.submissao_id === res.data.submissao_id ? res.data : s)));
      toast.success('Submissão enviada para análise do DETRAN');
    } catch (error) {
      console.error('Erro ao submeter:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao submeter');
    } finally {
      setSubmetendo(false);
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

  const portariaSelecionada = portarias.find((p) => p.portaria_id === portariaAtiva) || null;
  const submissaoSelecionada = portariaAtiva ? submissaoDe(portariaAtiva) : null;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Credenciamento por Portaria</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Responda ao checklist de exigências publicado pelo DETRAN pra cada portaria da sua UF de atuação.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando...</span>
          </div>
        ) : !company ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center text-zinc-400">
              Nenhuma empresa cadastrada — cadastre sua empresa primeiro.
            </CardContent>
          </Card>
        ) : portarias.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <ListChecks className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhuma portaria com checklist publicado pra sua UF de atuação ainda.</p>
            </CardContent>
          </Card>
        ) : !portariaAtiva ? (
          <div className="space-y-3">
            {portarias.map((portaria) => {
              const sub = submissaoDe(portaria.portaria_id);
              const cfg = sub ? STATUS_SUBMISSAO_CFG[sub.status] : null;
              return (
                <Card
                  key={portaria.portaria_id}
                  className="bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors cursor-pointer"
                  onClick={() => setPortariaAtiva(portaria.portaria_id)}
                >
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{portaria.numero ? `${portaria.numero} — ` : ''}{portaria.title}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        UF {portaria.estado_sigla} · {portaria.checklist_itens?.length || 0} item(ns) no checklist
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {cfg ? (
                        <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5`}>
                          {cfg.icon && <cfg.icon className="h-3 w-3 mr-1" />}{cfg.label}
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px]">Não iniciado</Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            <Button variant="link" size="sm" onClick={() => setPortariaAtiva(null)} className="h-auto p-0 text-zinc-400 hover:text-white">
              ← Voltar pra lista de portarias
            </Button>

            <div>
              <h2 className="text-lg font-semibold text-white">
                {portariaSelecionada?.numero ? `${portariaSelecionada.numero} — ` : ''}{portariaSelecionada?.title}
              </h2>
              <p className="text-xs text-zinc-500 mt-1">UF {portariaSelecionada?.estado_sigla}</p>
            </div>

            {!submissaoSelecionada ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-8 text-center">
                  <p className="text-zinc-400 mb-4">Você ainda não iniciou o envio pra esta portaria.</p>
                  <Button
                    onClick={() => iniciarSubmissao(portariaSelecionada.portaria_id)}
                    disabled={criandoSubmissao}
                    className="bg-primary-500 hover:bg-primary-600 text-white"
                  >
                    {criandoSubmissao ? 'Iniciando...' : 'Iniciar Credenciamento'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-mono">Status do processo</p>
                      <Badge className={`${STATUS_SUBMISSAO_CFG[submissaoSelecionada.status].className} mt-1 font-mono uppercase text-xs`}>
                        {STATUS_SUBMISSAO_CFG[submissaoSelecionada.status].label}
                      </Badge>
                    </div>
                    {submissaoSelecionada.status === 'rascunho' && (
                      <Button
                        onClick={() => submeter(submissaoSelecionada.submissao_id)}
                        disabled={submetendo || submissaoSelecionada.itens.some((i) => i.status !== 'enviado')}
                        className="bg-primary-500 hover:bg-primary-600 text-white"
                      >
                        {submetendo ? 'Enviando...' : 'Submeter pro DETRAN'}
                      </Button>
                    )}
                    {submissaoSelecionada.status === 'homologado' && (
                      <Button
                        onClick={() => baixarComprovante(submissaoSelecionada.submissao_id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                      >
                        <Download className="h-4 w-4" /> Baixar Comprovante
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  {submissaoSelecionada.itens.map((item) => {
                    const cfg = STATUS_ITEM_CFG[item.status];
                    const podeEnviar = item.status === 'pendente' ||
                      (item.status === 'inconforme' && submissaoSelecionada.status === 'em_diligencia');
                    return (
                      <Card key={item.item_id} className="bg-zinc-900/50 border-zinc-800">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm text-zinc-200 font-medium">{item.nome}</p>
                              {item.descricao && <p className="text-xs text-zinc-500 mt-0.5">{item.descricao}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5`}>
                                <cfg.icon className="h-3 w-3 mr-1" />{cfg.label}
                              </Badge>
                              {podeEnviar && (
                                <Button size="sm" variant="ghost" onClick={() => abrirUpload(item)}
                                  className="h-7 text-primary-500 hover:text-primary-400 hover:bg-primary-500/10">
                                  <Upload className="h-3.5 w-3.5 mr-1" /> Enviar
                                </Button>
                              )}
                            </div>
                          </div>
                          {item.status === 'inconforme' && item.justificativa && (
                            <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                              <p className="text-xs text-red-400"><strong>Motivo da diligência:</strong> {item.justificativa}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!itemUpload} onOpenChange={(open) => !open && setItemUpload(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Enviar documento</DialogTitle>
          </DialogHeader>
          {itemUpload && (
            <form onSubmit={enviarItem} className="space-y-4 mt-2">
              <p className="text-sm text-zinc-300">{itemUpload.nome}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-300">Número do documento</Label>
                  <Input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
                <div>
                  <Label className="text-zinc-300">Data de emissão</Label>
                  <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
              </div>
              <div>
                <Label className="text-zinc-300">Data de validade (opcional)</Label>
                <Input type="date" value={dataValidade} onChange={(e) => setDataValidade(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Arquivo</Label>
                <Input type="file" onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
              </div>
              <Button type="submit" disabled={enviando} className="w-full bg-primary-500 hover:bg-primary-600 text-white">
                {enviando ? 'Enviando...' : 'Enviar Documento'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default MinhasSubmissoes;
