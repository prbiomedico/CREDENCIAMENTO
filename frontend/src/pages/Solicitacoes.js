import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { ChevronRight, CheckCircle, Clock, XCircle, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: FileText },
  submetida: { label: 'Submetida', bg: 'bg-blue-500/10', text: 'text-blue-400', icon: Send },
  em_analise: { label: 'Em Análise', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Clock },
  aprovada: { label: 'Aprovada', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  rejeitada: { label: 'Rejeitada', bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
};

const Solicitacoes = () => {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, initialized } = useAuth();
  const api = useApi();

  useEffect(() => {
    if (!initialized || !user) return;
    fetchSolicitacoes();
  }, [initialized, user]);

  const fetchSolicitacoes = async () => {
    try {
      const data = await api.get('/solicitacoes');
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar solicitações'); }
    finally { setLoading(false); }
  };

  const handleSubmeter = async (solId) => {
    try {
      await api.post(`/solicitacoes/${solId}/submeter`);
      toast.success('Solicitação submetida ao DETRAN!');
      fetchSolicitacoes();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao submeter'); }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <ChevronRight className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Minhas Solicitações</h1>
            <p className="text-zinc-500 text-sm">Acompanhe o status de cada credenciamento</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : solicitacoes.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <ChevronRight className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-2">Nenhuma solicitação ainda</p>
              <p className="text-sm text-zinc-600">Candidate-se a um edital para iniciar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solicitacoes.map((sol) => {
              const cfg = STATUS_CONFIG[sol.status] || STATUS_CONFIG.rascunho;
              const Icon = cfg.icon;
              return (
                <Card key={sol.solicitacao_id} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">DETRAN-{sol.uf}</Badge>
                          <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                            <Icon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-300 mb-1">Etapa: <span className="text-white font-medium">{sol.etapa_atual}</span></p>
                        <p className="text-xs text-zinc-600 font-mono mb-3">{sol.solicitacao_id}</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${sol.progresso}%` }} />
                          </div>
                          <span className="text-xs font-mono text-primary-400">{sol.progresso}%</span>
                        </div>
                      </div>
                      {sol.status === 'rascunho' && (
                        <Button onClick={() => handleSubmeter(sol.solicitacao_id)} className="bg-primary-500 hover:bg-primary-600 text-white text-sm h-9 px-4 shrink-0">
                          <Send className="h-4 w-4 mr-1.5" /> Submeter ao DETRAN
                        </Button>
                      )}
                    </div>
                    {sol.observacoes_detran && (
                      <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                        <p className="text-xs text-zinc-400"><span className="text-primary-400 font-mono">DETRAN:</span> {sol.observacoes_detran}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Solicitacoes;
