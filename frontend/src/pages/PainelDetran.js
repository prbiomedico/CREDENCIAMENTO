import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { useApi } from '../hooks/useApi';
import {
  FileText, CheckCircle, Clock, XCircle,
  AlertCircle, ChevronRight, Plus, Building2,
  ClipboardList, FlaskConical, Award, ArrowRight
} from 'lucide-react';

const STATUS_CONFIG = {
  em_analise: { label: 'Em Análise Documental', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: FileText },
  aguardando_poc: { label: 'Aguardando POC', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: Clock },
  em_poc: { label: 'Em POC', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: FlaskConical },
  homologado: { label: 'Homologado', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle },
  reprovado: { label: 'Reprovado', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: XCircle },
  pendente: { label: 'Pendente', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/30', icon: AlertCircle },
};

const ETAPA_ICONS = {
  analise: { icon: ClipboardList, label: 'Análise Documental', route: '/detran/analise' },
  poc: { icon: FlaskConical, label: 'POC', route: '/detran/poc' },
  homologacao: { icon: Award, label: 'Homologação', route: '/detran/homologacao' },
};

const KPICard = ({ label, value, icon: Icon, color, bg }) => (
  <div className={`rounded-xl border p-5 flex items-center gap-4 ${bg}`}>
    <div className={`p-3 rounded-lg bg-zinc-900`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{label}</p>
    </div>
  </div>
);

const ProcessoCard = ({ processo, onClick }) => {
  const config = STATUS_CONFIG[processo.status] || STATUS_CONFIG.pendente;
  const Icon = config.icon;
  return (
    <div
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-orange-500/40 cursor-pointer transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-zinc-800">
          <Building2 className="w-4 h-4 text-zinc-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{processo.registradora_nome || 'Registradora'}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Portaria {processo.portaria_numero || '—'} · {processo.estado || '—'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.bg} ${config.color}`}>
          <Icon className="w-3 h-3" />
          {config.label}
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-orange-400 transition-colors" />
      </div>
    </div>
  );
};

const PainelDetran = () => {
  const navigate = useNavigate();
  const { apiCall } = useApi();
  const [processos, setProcessos] = useState([]);
  const [portarias, setPortarias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    const carregar = async () => {
      try {
        const [pResp, portResp] = await Promise.all([
          apiCall('/api/processos'),
          apiCall('/api/portarias'),
        ]);
        setProcessos(pResp?.processos || []);
        setPortarias(portResp?.portarias || []);
      } catch (e) {
        setProcessos([]);
        setPortarias([]);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  const kpis = {
    total: processos.length,
    em_analise: processos.filter(p => p.status === 'em_analise').length,
    em_poc: processos.filter(p => ['aguardando_poc', 'em_poc'].includes(p.status)).length,
    homologados: processos.filter(p => p.status === 'homologado').length,
    reprovados: processos.filter(p => p.status === 'reprovado').length,
  };

  const processosFiltrados = filtro === 'todos'
    ? processos
    : processos.filter(p => p.status === filtro);

  const FILTROS = [
    { key: 'todos', label: 'Todos' },
    { key: 'em_analise', label: 'Análise' },
    { key: 'aguardando_poc', label: 'Ag. POC' },
    { key: 'em_poc', label: 'Em POC' },
    { key: 'homologado', label: 'Homologados' },
    { key: 'reprovado', label: 'Reprovados' },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Painel DETRAN</h1>
            <p className="text-sm text-zinc-400 mt-1">Gerencie os processos de credenciamento de registradoras</p>
          </div>
          <button
            onClick={() => navigate('/detran/portarias')}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Portaria
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Total de Processos" value={kpis.total} icon={FileText} color="text-zinc-300" bg="bg-zinc-800/50 border-zinc-700" />
          <KPICard label="Em Análise Documental" value={kpis.em_analise} icon={ClipboardList} color="text-blue-400" bg="bg-blue-500/10 border-blue-500/30" />
          <KPICard label="Em POC" value={kpis.em_poc} icon={FlaskConical} color="text-orange-400" bg="bg-orange-500/10 border-orange-500/30" />
          <KPICard label="Homologados" value={kpis.homologados} icon={Award} color="text-emerald-400" bg="bg-emerald-500/10 border-emerald-500/30" />
        </div>

        {/* Atalhos de Etapas */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Etapas do Fluxo</h2>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(ETAPA_ICONS).map(([key, { icon: Icon, label, route }]) => (
              <button
                key={key}
                onClick={() => navigate(route)}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-orange-500/40 hover:bg-zinc-800/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-800 rounded-lg">
                    <Icon className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-sm font-medium text-white">{label}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-orange-400 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Processos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Processos Ativos</h2>
            <div className="flex gap-1.5 flex-wrap">
              {FILTROS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    filtro === f.key
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-orange-500/40'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-zinc-500 text-sm">Carregando processos...</div>
          ) : processosFiltrados.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-12 text-center">
              <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">Nenhum processo encontrado</p>
              <p className="text-zinc-600 text-xs mt-1">Crie uma portaria para iniciar um processo de credenciamento</p>
            </div>
          ) : (
            <div className="space-y-2">
              {processosFiltrados.map(p => (
                <ProcessoCard
                  key={p._id || p.id}
                  processo={p}
                  onClick={() => navigate(`/detran/processo/${p._id || p.id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Portarias Recentes */}
        {portarias.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Portarias Recentes</h2>
              <button onClick={() => navigate('/detran/portarias')} className="text-xs text-orange-400 hover:text-orange-300">Ver todas</button>
            </div>
            <div className="space-y-2">
              {portarias.slice(0, 3).map(p => (
                <div key={p._id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Portaria {p.numero}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{p.estado} · {p.descricao}</p>
                  </div>
                  <span className="text-xs text-zinc-500">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default PainelDetran;
