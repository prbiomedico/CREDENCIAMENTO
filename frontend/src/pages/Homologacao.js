import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, Award, CheckCircle, XCircle, Building2, ChevronDown, ChevronUp, FileText, Calendar } from 'lucide-react';

const ProcessoHomologacao = ({ processo, onHomologar, onReprovar }) => {
  const [aberto, setAberto] = useState(false);
  const [parecer, setParecer] = useState('');
  const [acao, setAcao] = useState(null);

  const jaFinalizado = ['homologado', 'reprovado'].includes(processo.status);

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
        <div className="flex items-center gap-3">
          {processo.status === 'homologado' && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <CheckCircle className="w-3 h-3" /> Homologado
            </span>
          )}
          {processo.status === 'reprovado' && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              <XCircle className="w-3 h-3" /> Reprovado
            </span>
          )}
          {!jaFinalizado && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-medium">
              <Award className="w-3 h-3" /> Pendente
            </span>
          )}
          {aberto ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {/* Resumo do Processo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-800 rounded-lg">
              <p className="text-xs text-zinc-500 mb-1">Docs Aprovados</p>
              <p className="text-sm font-semibold text-emerald-400">
                {(processo.documentos || []).filter(d => d.status === 'aprovado').length} / {(processo.documentos || []).length}
              </p>
            </div>
            <div className="p-3 bg-zinc-800 rounded-lg">
              <p className="text-xs text-zinc-500 mb-1">Itens POC Aprovados</p>
              <p className="text-sm font-semibold text-emerald-400">
                {(processo.itens_poc || []).filter(i => i.status === 'aprovado').length} / {(processo.itens_poc || []).length}
              </p>
            </div>
            {processo.data_poc && (
              <div className="p-3 bg-zinc-800 rounded-lg col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Data da POC Realizada</p>
                <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {new Date(processo.data_poc).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </div>

          {/* Parecer final ou resultado */}
          {jaFinalizado ? (
            <div className={`p-3 rounded-lg border ${processo.status === 'homologado' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <p className={`text-xs font-semibold mb-1 ${processo.status === 'homologado' ? 'text-emerald-400' : 'text-red-400'}`}>
                {processo.status === 'homologado' ? 'Parecer de Homologação' : 'Motivo da Reprovação'}
              </p>
              <p className="text-sm text-white">{processo.parecer_final || '—'}</p>
              {processo.data_homologacao && (
                <p className="text-xs text-zinc-500 mt-2">
                  Emitido em {new Date(processo.data_homologacao).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Emitir Parecer Final</p>
              <textarea
                value={parecer}
                onChange={e => setParecer(e.target.value)}
                placeholder="Descreva o parecer técnico e jurídico para esta homologação..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 resize-none h-24 focus:outline-none focus:border-orange-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onReprovar(processo._id, parecer); setAcao('reprovado'); }}
                  disabled={!parecer.trim()}
                  className="flex-1 py-2 text-sm bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <XCircle className="w-4 h-4" /> Reprovar
                </button>
                <button
                  onClick={() => { onHomologar(processo._id, parecer); setAcao('homologado'); }}
                  disabled={!parecer.trim()}
                  className="flex-1 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Award className="w-4 h-4" /> Homologar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Homologacao = () => {
  const navigate = useNavigate();
  const { apiCall } = useApi();
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('pendentes');

  useEffect(() => {
    const carregar = async () => {
      try {
        const resp = await apiCall('/api/processos?status=homologacao,homologado,reprovado');
        setProcessos(Array.isArray(resp?.processos) ? resp.processos : []);
      } catch {
        setProcessos([]);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const handleHomologar = async (processoId, parecer) => {
    try {
      await apiCall(`/api/processos/${processoId}/homologar`, {
        method: 'POST',
        body: JSON.stringify({ parecer_final: parecer, resultado: 'homologado' }),
      });
      setProcessos(prev => prev.map(p =>
        p._id === processoId ? { ...p, status: 'homologado', parecer_final: parecer, data_homologacao: new Date().toISOString() } : p
      ));
    } catch (e) { console.error(e); }
  };

  const handleReprovar = async (processoId, parecer) => {
    try {
      await apiCall(`/api/processos/${processoId}/homologar`, {
        method: 'POST',
        body: JSON.stringify({ parecer_final: parecer, resultado: 'reprovado' }),
      });
      setProcessos(prev => prev.map(p =>
        p._id === processoId ? { ...p, status: 'reprovado', parecer_final: parecer, data_homologacao: new Date().toISOString() } : p
      ));
    } catch (e) { console.error(e); }
  };

  const pendentes = processos.filter(p => p.status === 'homologacao');
  const concluidos = processos.filter(p => ['homologado', 'reprovado'].includes(p.status));
  const listaAtual = filtro === 'pendentes' ? pendentes : concluidos;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/painel-detran')} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Homologação</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Emita o parecer final e homologue as registradoras aprovadas</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{pendentes.length}</p>
            <p className="text-xs text-zinc-400 mt-1">Aguardando Parecer</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{concluidos.filter(p => p.status === 'homologado').length}</p>
            <p className="text-xs text-zinc-400 mt-1">Homologadas</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{concluidos.filter(p => p.status === 'reprovado').length}</p>
            <p className="text-xs text-zinc-400 mt-1">Reprovadas</p>
          </div>
        </div>

        <div className="flex gap-2">
          {[{ key: 'pendentes', label: 'Pendentes' }, { key: 'concluidos', label: 'Concluídos' }].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                filtro === f.key ? 'bg-orange-500 border-orange-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-orange-500/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">Carregando processos...</div>
        ) : listaAtual.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
            <Award className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">
              {filtro === 'pendentes' ? 'Nenhum processo aguardando homologação' : 'Nenhum processo concluído'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listaAtual.map(p => (
              <ProcessoHomologacao key={p._id} processo={p} onHomologar={handleHomologar} onReprovar={handleReprovar} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Homologacao;
