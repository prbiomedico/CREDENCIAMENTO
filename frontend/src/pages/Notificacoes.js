import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Bell, CheckCheck, Folder, TrendingUp, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Trash2, Download } from 'lucide-react';
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
  portaria_atualizada: (dados) => dados?.portaria_id ? `/portarias?portaria_id=${dados.portaria_id}` : null,
  submissao_recebida: (dados) => dados?.submissao_id ? `/detran/conferencia?submissao_id=${dados.submissao_id}` : null,
  checklist_inconforme: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  submissao_homologada: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  poc_agendada: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  pagamento_poc_recebido: (dados) => dados?.submissao_id ? `/detran/conferencia?submissao_id=${dados.submissao_id}` : null,
  pagamento_poc_atualizado: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  resultado_poc: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  taxa_credenciamento: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  taxa_credenciamento_recebida: (dados) => dados?.submissao_id ? `/detran/conferencia?submissao_id=${dados.submissao_id}` : null,
  taxa_credenciamento_atualizada: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  contrato_disponivel: (dados) => dados?.submissao_id ? `/credenciamento-portaria?submissao_id=${dados.submissao_id}` : null,
  contrato_assinado: (dados) => dados?.submissao_id ? `/detran/conferencia?submissao_id=${dados.submissao_id}` : null,
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const TIPO_CONFIG = {
  novo_edital: { icon: Folder, color: 'blue', label: 'Novo Edital' },
  status_atualizado: { icon: TrendingUp, color: 'primary', label: 'Status Atualizado' },
  documento_validado: { icon: FileText, color: 'emerald', label: 'Documento' },
  portaria_publicada: { icon: CheckCircle, color: 'emerald', label: 'Portaria' },
  portaria_atualizada: { icon: FileText, color: 'primary', label: 'Portaria Atualizada' },
  nova_solicitacao: { icon: TrendingUp, color: 'blue', label: 'Nova Solicitação' },
  solicitacao_registro_nova: { icon: FileText, color: 'blue', label: 'Registro de Contrato' },
  solicitacao_registro_concluida: { icon: CheckCircle, color: 'emerald', label: 'Registro Concluído' },
  solicitacao_registro_rejeitada: { icon: XCircle, color: 'red', label: 'Registro Rejeitado' },
  submissao_recebida: { icon: FileText, color: 'blue', label: 'Submissão de Credenciamento' },
  checklist_inconforme: { icon: AlertTriangle, color: 'primary', label: 'Pendência no Credenciamento' },
  submissao_homologada: { icon: CheckCircle, color: 'emerald', label: 'Credenciamento Homologado' },
  poc_agendada: { icon: Clock, color: 'primary', label: 'POC Agendada' },
  pagamento_poc_recebido: { icon: FileText, color: 'primary', label: 'Pagamento da POC' },
  pagamento_poc_atualizado: { icon: CheckCircle, color: 'emerald', label: 'Pagamento da POC' },
  resultado_poc: { icon: FileText, color: 'primary', label: 'Resultado da POC' },
  taxa_credenciamento: { icon: FileText, color: 'primary', label: 'Taxa de Credenciamento' },
  taxa_credenciamento_recebida: { icon: FileText, color: 'primary', label: 'Taxa Recebida' },
  taxa_credenciamento_atualizada: { icon: CheckCircle, color: 'emerald', label: 'Taxa Analisada' },
  contrato_disponivel: { icon: FileText, color: 'primary', label: 'Contrato Disponível' },
  contrato_assinado: { icon: CheckCircle, color: 'emerald', label: 'Contrato Assinado' },
};

const Notificacoes = () => {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionadas, setSelecionadas] = useState([]);
  const [processando, setProcessando] = useState(false);

  const { user, initialized, getToken } = useAuth();
  const navigate = useNavigate();

  const fetchNotifs = useCallback(async () => {
    try { await getToken(); } catch {}
    try {
      const res = await axios.get(`${API}/notificacoes`);
      setNotifs(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Erro ao carregar notificações'); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { if (!initialized || !user) return; fetchNotifs(); }, [fetchNotifs, initialized, user]);

  const marcarLida = async (id) => {
    await axios.patch(`${API}/notificacoes/${id}/lida`);
    setNotifs(prev => prev.map(n => n.notificacao_id === id ? { ...n, lida: true } : n));
  };

  const abrirNotificacao = (notif) => {
    if (!notif.lida) marcarLida(notif.notificacao_id);
    const destinoEmpresa = user?.perfil === 'registradora' && notif.dados?.company_id && notif.dados?.estado_sigla && notif.dados?.submissao_id;
    const rota = destinoEmpresa ? `/acompanhamento/${encodeURIComponent(notif.dados.estado_sigla)}?empresa=${encodeURIComponent(notif.dados.company_id)}&pedido=${encodeURIComponent(notif.dados.submissao_id)}` : ROTA_POR_TIPO[notif.tipo]?.(notif.dados);
    if (rota) navigate(rota);
  };

  const marcarTodasLidas = async () => {
    await axios.patch(`${API}/notificacoes/todas/lidas`);
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
    toast.success('Todas marcadas como lidas');
  };

  const naoLidas = notifs.filter(n => !n.lida).length;
  const todasSelecionadas = notifs.length > 0 && selecionadas.length === notifs.length;
  const alternarSelecao = (id) => setSelecionadas((atuais) =>
    atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]
  );
  const alternarTodas = () => setSelecionadas(todasSelecionadas ? [] : notifs.map((n) => n.notificacao_id));

  const excluirSelecionadas = async () => {
    if (!selecionadas.length || !window.confirm(`Apagar ${selecionadas.length} notificação(ões)? Esta ação não pode ser desfeita.`)) return;
    setProcessando(true);
    try {
      await axios.delete(`${API}/notificacoes`, { data: { notificacao_ids: selecionadas } });
      setNotifs((atuais) => atuais.filter((n) => !selecionadas.includes(n.notificacao_id)));
      setSelecionadas([]); toast.success('Notificações apagadas');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Não foi possível apagar as notificações'); }
    finally { setProcessando(false); }
  };

  const exportarSelecionadas = async () => {
    if (!selecionadas.length) return;
    setProcessando(true);
    try {
      const res = await axios.post(`${API}/notificacoes/exportar`, { notificacao_ids: selecionadas }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data); const link = document.createElement('a');
      link.href = url; link.download = 'notificacoes_sigcr.pdf'; link.click(); URL.revokeObjectURL(url);
      toast.success('PDF gerado com sucesso');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Não foi possível exportar o PDF'); }
    finally { setProcessando(false); }
  };

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
              <p className="text-slate-500 text-sm">{naoLidas} não lidas</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {naoLidas > 0 && <Button onClick={marcarTodasLidas} variant="outline" size="sm"><CheckCheck className="h-4 w-4 mr-2" /> Marcar todas como lidas</Button>}
            {selecionadas.length > 0 && <><Button onClick={exportarSelecionadas} disabled={processando} variant="outline" size="sm"><Download className="h-4 w-4 mr-2" /> Exportar PDF ({selecionadas.length})</Button><Button onClick={excluirSelecionadas} disabled={processando} variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" /> Apagar ({selecionadas.length})</Button></>}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifs.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-slate-600">Nenhuma notificação ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={todasSelecionadas} onChange={alternarTodas} className="h-4 w-4 rounded border-slate-300 accent-amber-500" />
              Selecionar todas
            </label>
            {notifs.map((notif) => {
              const cfg = TIPO_CONFIG[notif.tipo] || TIPO_CONFIG.status_atualizado;
              const Icon = cfg.icon;
              return (
                <div key={notif.notificacao_id} onClick={() => abrirNotificacao(notif)}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${notif.lida ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300' : 'bg-white border-amber-300 shadow-sm hover:border-amber-400'}`}>
                  <input type="checkbox" checked={selecionadas.includes(notif.notificacao_id)} onClick={(e) => e.stopPropagation()} onChange={() => alternarSelecao(notif.notificacao_id)} aria-label={`Selecionar ${notif.titulo}`} className="mt-2 h-4 w-4 shrink-0 rounded border-slate-300 accent-amber-500" />
                  <div className={`w-9 h-9 rounded-lg bg-${cfg.color}-500/10 border border-${cfg.color}-500/20 flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 text-${cfg.color}-400`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-semibold ${notif.lida ? 'text-slate-800' : 'text-slate-950'}`}>{notif.titulo}</p>
                      {!notif.lida && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">{notif.mensagem}</p>
                    {notif.dados?.modo_homologacao && (
                      <span className="inline-flex mt-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-amber-800">
                        Homologação administrativa
                      </span>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">{new Date(notif.created_at).toLocaleString('pt-BR')}</p>
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
