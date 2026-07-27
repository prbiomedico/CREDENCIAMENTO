import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, FlaskConical, CheckCircle, XCircle, AlertCircle, Building2, ChevronDown, ChevronUp, Calendar, Send } from 'lucide-react';

const ITEM_STATUS = {
  pendente:  { label: 'Pendente',  color: 'text-zinc-400',   dot: 'bg-zinc-500' },
  aprovado:  { label: 'Aprovado',  color: 'text-emerald-400', dot: 'bg-emerald-500' },
  reprovado: { label: 'Reprovado', color: 'text-red-400',     dot: 'bg-red-500' },
};

const ProcessoPOC = ({ processo, onConvocar, onAvaliarItem, onAvancar }) => {
  const [aberto, setAberto] = useState(false);
  const [dataConvocacao, setDataConvocacao] = useState('');
  const [mostrarConvocacao, setMostrarConvocacao] = useState(false);

  const itens = processo.itens_poc || [];
  const aprovados = itens.filter(i => i.status === 'aprovado').length;
  const total = itens.length;
  const progresso = total > 0 ? Math.round((aprovados / total) * 100) : 0;
  const convocado = !!processo.data_poc;
  const todosAprovados = total > 0 && aprovados === total;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition-colors" onClick={() => setAberto(!aberto)}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <Building2 className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{processo.registradora_nome || 'Registradora'}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Portaria {processo.portaria_numero || '—'} · {processo.estado || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            {convocado ? (
              <p className="text-xs text-orange-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                POC: {new Date(processo.data_poc).toLocaleDateString('pt-BR')}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">Aguardando convocação</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 bg-zinc-800 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs text-zinc-500">{aprovados}/{total}</span>
            </div>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {/* Convocação */}
          {!convocado && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              {!mostrarConvocacao ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm text-yellow-400">Registradora ainda não foi convocada para a POC</p>
                  </div>
                  <button
                    onClick={() => setMostrarConvocacao(true)}
                    className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" /> Convocar
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-yellow-400 font-medium">Definir data da POC</p>
                  <input
                    type="date"
                    value={dataConvocacao}
                    onChange={e => setDataConvocacao(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setMostrarConvocacao(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                    <button
                      onClick={() => { onConvocar(processo._id, dataConvocacao); setMostrarConvocacao(false); }}
                      disabled={!dataConvocacao}
                      className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Confirmar Convocação
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Itens da POC */}
          {convocado && (
            <>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Itens da POC ({total} itens)</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {itens.map((item, idx) => {
                  const st = ITEM_STATUS[item.status] || ITEM_STATUS.pendente;
                  return (
                    <div key={item._id || idx} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 w-5">{idx + 1}.</span>
                        <span className="text-sm text-white">{item.descricao}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${st.color} flex items-center gap-1`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        {item.status === 'pendente' && (
                          <div className="flex gap-1">
                            <button onClick={() => onAvaliarItem(processo._id, item._id, 'aprovado')} className="p-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-emerald-400 text-xs transition-colors">✓</button>
                            <button onClick={() => onAvaliarItem(processo._id, item._id, 'reprovado')} className="p-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-400 text-xs transition-colors">✗</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {todosAprovados && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm text-emerald-400">Todos os itens aprovados. Pronto para Homologação.</p>
                  </div>
                  <button
                    onClick={() => onAvancar(processo._id)}
                    className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                  >
                    Avançar para Homologação
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const POC = () => {
  const navigate = useNavigate();
  const { apiCall } = useApi();
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      try {
        const resp = await apiCall('/api/processos?status=aguardando_poc,em_poc');
        setProcessos(resp?.processos || []);
      } catch {
        setProcessos([]);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const handleConvocar = async (processoId, data) => {
    try {
      await apiCall(`/api/processos/${processoId}/convocar-poc`, { method: 'POST', body: JSON.stringify({ data_poc: data }) });
      setProcessos(prev => prev.map(p => p._id === processoId ? { ...p, data_poc: data, status: 'em_poc' } : p));
    } catch (e) { console.error(e); }
  };

  const handleAvaliarItem = async (processoId, itemId, status) => {
    try {
      await apiCall(`/api/processos/${processoId}/poc/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setProcessos(prev => prev.map(p => {
        if (p._id !== processoId) return p;
        return { ...p, itens_poc: (p.itens_poc || []).map(i => i._id === itemId ? { ...i, status } : i) };
      }));
    } catch (e) { console.error(e); }
  };

  const handleAvancar = async (processoId) => {
    try {
      await apiCall(`/api/processos/${processoId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'homologacao' }) });
      setProcessos(prev => prev.filter(p => p._id !== processoId));
    } catch (e) { console.error(e); }
  };

  const emPOC = processos.filter(p => p.data_poc).length;
  const aguardando = processos.filter(p => !p.data_poc).length;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/painel-detran')} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Prova de Conceito (POC)</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Convoque registradoras e registre os resultados técnicos</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{aguardando}</p>
            <p className="text-xs text-zinc-400 mt-1">Aguardando Convocação</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{emPOC}</p>
            <p className="text-xs text-zinc-400 mt-1">Em Execução</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{processos.length}</p>
            <p className="text-xs text-zinc-400 mt-1">Total na Etapa</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">Carregando processos...</div>
        ) : processos.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
            <FlaskConical className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Nenhum processo na etapa de POC</p>
          </div>
        ) : (
          <div className="space-y-3">
            {processos.map(p => (
              <ProcessoPOC key={p._id} processo={p} onConvocar={handleConvocar} onAvaliarItem={handleAvaliarItem} onAvancar={handleAvancar} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default POC;
