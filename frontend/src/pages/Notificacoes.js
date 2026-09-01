import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Bell, CheckCheck, Folder, TrendingUp, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Ciclo central Portaria→Submissão (ver PENDING_ACTIONS.md, levantamento do
// fluxo "carro chefe"): cada tipo abaixo carrega o id certo em `dados` desde
// sempre (criar_notificacao já grava portaria_id/submissao_id), só nunca
// tinha sido usado pra navegar. Deliberadamente só os 4 tipos deste ciclo —
// tipos do sistema antigo Editais+Solicitações (nova_solicitacao etc.) e os
// de vencimento/registro continuam só marcando como lida, sem rota própria,
// pra não misturar os dois fluxos.
const ROTA_POR_TIPO = {
  novo_edital: (dados) => dados?.portaria_id ? `/portarias?portaria_id=${dados.portaria_id}` : null,
  submissao_recebida: (dados) => dados?.submissao_id ? `/detran/conferencia?submissao_id=${dados.submissao_id}` : null,
  checklist_inconforme: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  submissao_homologada: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const TIPO_CONFIG = {
  novo_edital: { icon: Folder, color: 'blue', label: 'Novo Edital' },
  status_atualizado: { icon: TrendingUp, color: 'primary', label: 'Status Atualizado' },
  documento_validado: { icon: FileText, color: 'emerald', label: 'Documento' },
  portaria_publicada: { icon: CheckCircle, color: 'emerald', label: 'Portaria' },
  nova_solicitacao: { icon: TrendingUp, color: 'blue', label: 'Nova Solicitação' },
  solicitacao_registro_nova: { icon: FileText, color: 'blue', label: 'Registro de Contrato' },
  solicitacao_registro_concluida: { icon: CheckCircle, color: 'emerald', label: 'Registro Concluído' },
  solicitacao_registro_rejeitada: { icon: XCircle, color: 'red', label: 'Registro Rejeitado' },
  submissao_recebida: { icon: FileText, color: 'blue', label: 'Submissão de Credenciamento' },
  checklist_inconforme: { icon: AlertTriangle, color: 'primary', label: 'Pendência no Credenciamento' },
  submissao_homologada: { icon: CheckCircle, color: 'emerald', label: 'Credenciamento Homologado' },
};

const Notificacoes = () => {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const { user, initialized, getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!initialized || !user) return; fetchNotifs(); }, [initialized, user]);

  const fetchNotifs = async () => {
    try { await getToken(); } catch {}
    try {
      const res = await axios.get(`${API}/notificacoes`);
      setNotifs(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Erro ao carregar notificações'); }
    finally { setLoading(false); }
  };

  const marcarLida = async (id) => {
    await axios.patch(`${API}/notificacoes/${id}/lida`);
    setNotifs(prev => prev.map(n => n.notificacao_id === id ? { ...n, lida: true } : n));
  };

  const abrirNotificacao = (notif) => {
    if (!notif.lida) marcarLida(notif.notificacao_id);
    const rota = ROTA_POR_TIPO[notif.tipo]?.(notif.dados);
    if (rota) navigate(rota);
  };

  const marcarTodasLidas = async () => {
    await axios.patch(`${API}/notificacoes/todas/lidas`);
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
    toast.success('Todas marcadas como lidas');
  };

  const naoLidas = notifs.filter(n => !n.lida).length;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center relative">
              <Bell className="h-5 w-5 text-primary-500" />
              {naoLidas > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center text-[9px] text-white font-bold">{naoLidas}</span>}
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight">Notificações</h1>
              <p className="text-zinc-500 text-sm">{naoLidas} não lidas</p>
            </div>
          </div>
          {naoLidas > 0 && (
            <Button onClick={marcarTodasLidas} variant="outline" size="sm">
              <CheckCheck className="h-4 w-4 mr-2" /> Marcar todas como lidas
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifs.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhuma notificação ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifs.map((notif) => {
              const cfg = TIPO_CONFIG[notif.tipo] || TIPO_CONFIG.status_atualizado;
              const Icon = cfg.icon;
              return (
                <div key={notif.notificacao_id} onClick={() => abrirNotificacao(notif)}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${notif.lida ? 'bg-zinc-900/30 border-zinc-800/50 opacity-60' : 'bg-zinc-900/70 border-zinc-700 hover:border-zinc-600'}`}>
                  <div className={`w-9 h-9 rounded-lg bg-${cfg.color}-500/10 border border-${cfg.color}-500/20 flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 text-${cfg.color}-400`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-semibold ${notif.lida ? 'text-zinc-400' : 'text-white'}`}>{notif.titulo}</p>
                      {!notif.lida && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                    </div>
                    <p className="text-xs text-zinc-500">{notif.mensagem}</p>
                    <p className="text-[10px] text-zinc-600 mt-1 font-mono">{new Date(notif.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Notificacoes;
