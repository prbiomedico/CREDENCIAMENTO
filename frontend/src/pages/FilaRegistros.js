import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { FileText, Download, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: Clock },
  em_processamento: { label: 'Em Processamento', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Loader2 },
  concluido: { label: 'Concluído', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  rejeitado: { label: 'Rejeitado', bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
};

const FilaRegistros = () => {
  const { user, initialized, getToken } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [concluirAlvo, setConcluirAlvo] = useState(null);
  const [numeroRegistro, setNumeroRegistro] = useState('');
  const [comprovantePdf, setComprovantePdf] = useState(null);
  const [processando, setProcessando] = useState(false);

  const [rejeitarAlvo, setRejeitarAlvo] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  useEffect(() => { if (!initialized || !user) return; fetchSolicitacoes(); }, [initialized, user]);

  const fetchSolicitacoes = async () => {
    try { await getToken(); } catch {}
    setLoading(true);
    try {
      const response = await axios.get(`${API}/solicitacoes-registro`, { withCredentials: true });
      setSolicitacoes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar fila de registros:', error);
      toast.error('Erro ao carregar fila de registros');
    } finally {
      setLoading(false);
    }
  };

  const baixarContrato = async (solicitacaoId) => {
    try {
      const response = await axios.get(`${API}/solicitacoes-registro/${solicitacaoId}/contrato`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato_${solicitacaoId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Erro ao baixar contrato');
    }
  };

  const abrirConcluir = (sol) => {
    setConcluirAlvo(sol);
    setNumeroRegistro('');
    setComprovantePdf(null);
  };

  const handleConcluir = async (e) => {
    e.preventDefault();
    if (!comprovantePdf) {
      toast.error('Anexe o comprovante do DETRAN (PDF)');
      return;
    }
    setProcessando(true);
    try {
      const fd = new FormData();
      fd.append('numero_registro_detran', numeroRegistro);
      fd.append('comprovante', comprovantePdf);
      await axios.patch(`${API}/solicitacoes-registro/${concluirAlvo.solicitacao_registro_id}/concluir`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Solicitação concluída!');
      setConcluirAlvo(null);
      fetchSolicitacoes();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao concluir solicitação');
    } finally {
      setProcessando(false);
    }
  };

  const handleRejeitar = async (e) => {
    e.preventDefault();
    setProcessando(true);
    try {
      await axios.patch(`${API}/solicitacoes-registro/${rejeitarAlvo.solicitacao_registro_id}/rejeitar`,
        { motivo: motivoRejeicao || null },
        { withCredentials: true }
      );
      toast.success('Solicitação rejeitada');
      setRejeitarAlvo(null);
      setMotivoRejeicao('');
      fetchSolicitacoes();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao rejeitar solicitação');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Fila de Registro de Contrato</h1>
            <p className="text-zinc-500 text-sm">Solicitações de registro recebidas das financeiras vinculadas</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : solicitacoes.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhuma solicitação recebida ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solicitacoes.map((sol) => {
              const cfg = STATUS_CONFIG[sol.status] || STATUS_CONFIG.pendente;
              const Icon = cfg.icon;
              const pendenteOuProcessando = sol.status === 'pendente' || sol.status === 'em_processamento';
              return (
                <Card key={sol.solicitacao_registro_id} className="bg-card border-border hover:border-input transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-mono text-xs">{sol.veiculo_placa}</Badge>
                          <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                            <Icon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">{sol.devedor_nome}</h3>
                        <p className="text-sm text-zinc-400 mb-1">
                          {sol.veiculo_marca_modelo} {sol.veiculo_ano} · Chassi {sol.veiculo_chassi}
                        </p>
                        <p className="text-sm text-zinc-400 mb-2">
                          Valor: R$ {Number(sol.valor_total_divida).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Juros: {sol.taxa_juros}
                        </p>
                        <p className="text-xs text-zinc-600">Enviado em {new Date(sol.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 w-40">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => baixarContrato(sol.solicitacao_registro_id)}>
                          <Download className="h-3.5 w-3.5" /> Contrato
                        </Button>
                        {pendenteOuProcessando && (
                          <>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => abrirConcluir(sol)}>
                              Concluir
                            </Button>
                            <Button size="sm" variant="destructive-outline" onClick={() => setRejeitarAlvo(sol)}>
                              Rejeitar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog: Concluir */}
        <Dialog open={!!concluirAlvo} onOpenChange={(open) => { if (!open) setConcluirAlvo(null); }}>
          <DialogContent className="bg-card border-input text-white">
            <DialogHeader>
              <DialogTitle>Concluir Registro de Contrato</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleConcluir} className="space-y-4">
              <div>
                <Label className="text-zinc-300">Número de registro no DETRAN</Label>
                <Input value={numeroRegistro} onChange={(e) => setNumeroRegistro(e.target.value)} className="bg-zinc-800 border-input text-white mt-1" required />
              </div>
              <div>
                <Label className="text-zinc-300">Comprovante do DETRAN (PDF)</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setComprovantePdf(e.target.files?.[0] || null)}
                  className="bg-zinc-800 border-input text-white mt-1"
                  required
                />
              </div>
              <Button type="submit" disabled={processando} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full">
                {processando ? 'Concluindo...' : 'Confirmar Conclusão'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Rejeitar */}
        <Dialog open={!!rejeitarAlvo} onOpenChange={(open) => { if (!open) { setRejeitarAlvo(null); setMotivoRejeicao(''); } }}>
          <DialogContent className="bg-card border-input text-white">
            <DialogHeader>
              <DialogTitle>Rejeitar Solicitação de Registro</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRejeitar} className="space-y-4">
              <div>
                <Label className="text-zinc-300">Motivo (opcional)</Label>
                <Textarea value={motivoRejeicao} onChange={(e) => setMotivoRejeicao(e.target.value)} className="bg-zinc-800 border-input text-white mt-1" placeholder="Explique por que a solicitação está sendo rejeitada" />
              </div>
              <Button type="submit" variant="destructive" disabled={processando} className="w-full">
                {processando ? 'Rejeitando...' : 'Confirmar Rejeição'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default FilaRegistros;
