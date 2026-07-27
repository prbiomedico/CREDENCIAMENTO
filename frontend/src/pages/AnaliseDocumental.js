import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useApi } from '../hooks/useApi';
import { ArrowLeft, FileText, CheckCircle, XCircle, AlertCircle, Building2, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';

const DOC_STATUS = {
  pendente:  { label: 'Pendente',  color: 'text-zinc-400',   bg: 'bg-zinc-800 border-zinc-700' },
  aprovado:  { label: 'Aprovado',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  reprovado: { label: 'Reprovado', color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' },
};

const ProcessoAnalise = ({ processo, onAtualizarDoc }) => {
  const [aberto, setAberto] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [docSelecionado, setDocSelecionado] = useState(null);

  const docs = processo.documentos || [];
  const aprovados = docs.filter(d => d.status === 'aprovado').length;
  const total = docs.length;
  const progresso = total > 0 ? Math.round((aprovados / total) * 100) : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setAberto(!aberto)}
      >
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
            <p className="text-xs text-zinc-400">{aprovados}/{total} docs aprovados</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 bg-zinc-800 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs text-zinc-500">{progresso}%</span>
            </div>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>

      {aberto && (
        <div className="border-t border-zinc-800 p-4 space-y-3">
          {docs.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">Nenhum documento enviado ainda</p>
          ) : docs.map(doc => {
            const st = DOC_STATUS[doc.status] || DOC_STATUS.pendente;
            return (
              <div key={doc._id || doc.nome} className={`border rounded-lg p-3 ${st.bg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm text-white">{doc.nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                    {doc.status === 'pendente' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onAtualizarDoc(processo._id, doc._id, 'aprovado', '')}
                          className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-emerald-400 transition-colors"
                          title="Aprovar"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDocSelecionado(docSelecionado === doc._id ? null : doc._id)}
                          className="p-1.5 bg-red-500/20 hover:bg-red-500/30 rounded text-red-400 transition-colors"
                          title="Reprovar"
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {doc.observacao && (
                  <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> {doc.observacao}
                  </p>
                )}
                {docSelecionado === doc._id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={observacao}
                      onChange={e => setObservacao(e.target.value)}
                      placeholder="Motivo da reprovação (obrigatório)..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none h-20 focus:outline-none focus:border-orange-500"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setDocSelecionado(null)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                      <button
                        onClick={() => { onAtualizarDoc(processo._id, doc._id, 'reprovado', observacao); setDocSelecionado(null); setObservacao(''); }}
                        className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                        disabled={!observacao.trim()}
                      >
                        Confirmar Reprovação
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {docs.length > 0 && aprovados === total && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <p className="text-sm text-emerald-400">Todos os documentos aprovados. Processo pode avançar para POC.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AnaliseDocumental = () => {
  const navigate = useNavigate();
  const { apiCall } = useApi();
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      try {
        const resp = await apiCall('/api/processos?status=em_analise');
        setProcessos(resp?.processos || []);
      } catch {
        setProcessos([]);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const handleAtualizarDoc = async (processoId, docId, status, observacao) => {
    try {
      await apiCall(`/api/processos/${processoId}/documentos/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, observacao }),
      });
      setProcessos(prev => prev.map(p => {
        if (p._id !== processoId) return p;
        return {
          ...p,
          documentos: (p.documentos || []).map(d =>
            d._id === docId ? { ...d, status, observacao } : d
          )
        };
      }));
    } catch (e) {
      console.error('Erro ao atualizar documento', e);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/painel-detran')} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Análise Documental</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Revise e aprove os documentos enviados pelas registradoras</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{processos.length}</p>
            <p className="text-xs text-zinc-400 mt-1">Processos em Análise</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{processos.reduce((acc, p) => acc + (p.documentos || []).filter(d => d.status === 'pendente').length, 0)}</p>
            <p className="text-xs text-zinc-400 mt-1">Docs Pendentes</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{processos.reduce((acc, p) => acc + (p.documentos || []).filter(d => d.status === 'aprovado').length, 0)}</p>
            <p className="text-xs text-zinc-400 mt-1">Docs Aprovados</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">Carregando processos...</div>
        ) : processos.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Nenhum processo aguardando análise documental</p>
          </div>
        ) : (
          <div className="space-y-3">
            {processos.map(p => (
              <ProcessoAnalise key={p._id} processo={p} onAtualizarDoc={handleAtualizarDoc} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnaliseDocumental;
