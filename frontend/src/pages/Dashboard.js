import GradientMenu from '../components/ui/gradient-menu';
import { MapaNacional } from '../components/ui/interactive-map';
import VaporizeTextCycle from '../components/ui/vapour-text-effect';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Building2, CreditCard, FileText, Search, TrendingUp, Shield, CheckCircle, Clock, AlertCircle, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { toast } from 'sonner';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [vencimentoResumo, setVencimentoResumo] = useState({ vencendo: [], vencidos: [] });
  const [loading, setLoading] = useState(true);
  const { user, initialized } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialized || !user) return;
    fetchStats();
    fetchVencimentoResumo();
  }, [initialized, user]);

  const fetchStats = async () => {
    try {
      const data = await api.get('/stats');
      setStats(data);
    } catch {
      // Stats podem não existir ainda
      setStats({
        total_companies: 0,
        total_documents: 0,
        pending_validations: 0,
        active_portarias: 0,
        compliance_verde: 0,
        compliance_amarelo: 0,
        compliance_vermelho: 0,
      });
    } finally { setLoading(false); }
  };

  const fetchVencimentoResumo = async () => {
    try {
      const data = await api.get('/documentos/vencimento-resumo');
      setVencimentoResumo({
        vencendo: Array.isArray(data?.vencendo) ? data.vencendo : [],
        vencidos: Array.isArray(data?.vencidos) ? data.vencidos : [],
      });
    } catch {
      setVencimentoResumo({ vencendo: [], vencidos: [] });
    }
  };

  // Item 1 do Dashboard (2026-08-27): cada card leva pra tela/filtro real
  // que corresponde ao número mostrado. Mapeamento por perfil:
  // - registradora/financeira (dona de 1 empresa própria): "Minha X" +
  //   Documentos/Pendências/Semáforo apontam pra própria tela de Documentos,
  //   com filtro por status/compliance (infra construída nas fatias
  //   anteriores desta mesma sessão).
  // - sigcr_admin/detran/detran_admin: Empresas virou 2 cards reais
  //   (Registradoras/Financeiras, visão agregada por UF) em vez do card
  //   único; Documentos/Pendências/Semáforo apontam pra Registradoras
  //   (mesmo escopo que GET /stats passou a usar pro DETRAN depois do fix
  //   do bug de ownership) com o filtro correspondente — não existe uma
  //   tela de "documentos" própria pro lado DETRAN (a existente,
  //   /credenciamento/documentos, é outra coisa: documentos_gov, não
  //   documentos de credenciamento de empresa).
  const isEmpresaSelf = user?.perfil === 'registradora' || user?.perfil === 'financeira';
  const isDetranOuAdmin = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil);

  const empresaCards = user?.perfil === 'registradora'
    ? [{ label: 'Minha Registradora', value: stats?.total_companies || 0, icon: Building2, color: 'blue', to: '/registradoras-empresa' }]
    : user?.perfil === 'financeira'
    ? [{ label: 'Minha Financeira', value: stats?.total_companies || 0, icon: Building2, color: 'blue', to: '/financeiras-empresa' }]
    : isDetranOuAdmin
    ? [
        { label: 'Registradoras', value: stats?.total_registradoras || 0, icon: Building2, color: 'blue', to: '/registradoras' },
        { label: 'Financeiras', value: stats?.total_financeiras || 0, icon: CreditCard, color: 'blue', to: '/financeiras' },
      ]
    : [{ label: 'Empresas', value: stats?.total_companies || 0, icon: Building2, color: 'blue' }];

  const documentosTo = isEmpresaSelf ? '/documentos' : (isDetranOuAdmin ? '/registradoras' : undefined);
  const pendenciasTo = isEmpresaSelf ? '/documentos?status=pending' : (isDetranOuAdmin ? '/registradoras?pendencias=1' : undefined);
  // financeira não tem acesso à rota /portarias (nem no nav nem autorizado no
  // backend) — card fica estático só pra esse perfil, mesmo ele aparecendo
  // hoje no dashboard compartilhado (achado sinalizado no item 43).
  const portariasTo = user?.perfil === 'financeira' ? undefined : '/portarias?status=vigente';

  const CARDS = [
    ...empresaCards,
    { label: 'Documentos', value: stats?.total_documents || 0, icon: FileText, color: 'primary', to: documentosTo },
    { label: 'Pendências', value: stats?.pending_validations || 0, icon: Clock, color: 'yellow', to: pendenciasTo },
    { label: 'Portarias', value: stats?.active_portarias || 0, icon: Search, color: 'emerald', to: portariasTo },
  ];

  const semaforoTo = (bucket) => (isEmpresaSelf ? `/documentos?compliance=${bucket}` : (isDetranOuAdmin ? `/registradoras?compliance=${bucket}` : undefined));

  const SEMAFORO = [
    { label: 'Conformes', value: stats?.compliance_verde || 0, color: 'emerald', icon: CheckCircle, to: semaforoTo('valido') },
    { label: 'Atenção', value: stats?.compliance_amarelo || 0, color: 'amber', icon: Clock, to: semaforoTo('vencendo') },
    { label: 'Crítico', value: stats?.compliance_vermelho || 0, color: 'red', icon: AlertCircle, to: semaforoTo('vencido') },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold tracking-tight">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Bem-vindo ao SIGCR — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      {/* VaporizeText Hero  21st.dev */}
      <div style={{ width: "100%", height: "80px", position: "relative", marginBottom: "8px" }}>
        <VaporizeTextCycle
          texts={["Credenciamento", "Compliance", "SIGCR"]}
          font={{ fontFamily: "Inter, sans-serif", fontSize: "36px", fontWeight: 700 }}
          color="rgb(33, 150, 243)"
          spread={4}
          density={6}
          animation={{ vaporizeDuration: 2.5, fadeInDuration: 0.8, waitDuration: 1 }}
          direction="left-to-right"
          alignment="left"
          tag="h2"
        />
      </div>
      <div style={{ marginTop:"16px", marginBottom:"8px" }}>
        <GradientMenu currentPath={window.location.pathname} onNavigate={(p) => window.location.href=p} />
      </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Métricas — BentoGrid (Fase 3, PENDING_ACTIONS.md item 36):
                4 cards de stat (1x1, sem hover de ação — são só leitura, ver
                convenção de `interactive` em bento-grid.jsx) + Semáforo de
                Compliance e Documentos Vencendo como células 2x1, mesma
                linha, pra ficar lado a lado em vez de empilhado. */}
            <BentoGrid className="mb-8">
              {CARDS.map(({ label, value, icon: Icon, color, to }) => (
                <BentoCard
                  key={label}
                  interactive={!!to}
                  onClick={to ? () => navigate(to) : undefined}
                  className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">{label}</p>
                      <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
                        <Icon className={`h-4 w-4 text-${color}-400`} />
                      </div>
                    </div>
                    <p className={`text-3xl font-bold font-mono text-${color}-400`}>{value}</p>
                  </CardContent>
                </BentoCard>
              ))}

              {/* Semáforo de Compliance */}
              <BentoCard size="2x1" interactive={false} className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary-500" />
                    Semáforo de Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {SEMAFORO.map(({ label, value, color, icon: Icon, to }) => (
                      <div
                        key={label}
                        onClick={to ? () => navigate(to) : undefined}
                        className={`p-4 rounded-xl bg-${color}-500/10 border border-${color}-500/20 text-center${to ? ' cursor-pointer hover:brightness-125 transition-[filter]' : ''}`}
                      >
                        <Icon className={`h-6 w-6 text-${color}-400 mx-auto mb-2`} />
                        <p className={`text-2xl font-bold font-mono text-${color}-400`}>{value}</p>
                        <p className="text-xs text-zinc-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </BentoCard>

              {/* Documentos vencendo (30 dias) + vencidos */}
              {(vencimentoResumo.vencendo.length > 0 || vencimentoResumo.vencidos.length > 0) && (
                <BentoCard size="2x1" interactive={false} className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-heading flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-amber-400" />
                      Documentos Vencendo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                        <p className="text-2xl font-bold font-mono text-amber-400">{vencimentoResumo.vencendo.length}</p>
                        <p className="text-xs text-zinc-500 mt-1">Vencendo em até 30 dias</p>
                      </div>
                      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                        <p className="text-2xl font-bold font-mono text-red-400">{vencimentoResumo.vencidos.length}</p>
                        <p className="text-xs text-zinc-500 mt-1">Já vencidos</p>
                      </div>
                    </div>

                    {vencimentoResumo.vencidos.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Vencidos</p>
                        <div className="space-y-1.5">
                          {vencimentoResumo.vencidos.map((item) => (
                            <div key={`${item.origem}-${item.id}`} className="flex items-center justify-between text-sm p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                              <span className="text-zinc-300">{item.nome}</span>
                              <span className="text-red-400 font-mono text-xs">{new Date(item.vencimento).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {vencimentoResumo.vencendo.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Vencendo em breve</p>
                        <div className="space-y-1.5">
                          {vencimentoResumo.vencendo.map((item) => (
                            <div key={`${item.origem}-${item.id}`} className="flex items-center justify-between text-sm p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                              <span className="text-zinc-300">{item.nome}</span>
                              <span className="text-amber-400 font-mono text-xs">{new Date(item.vencimento).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </BentoCard>
              )}
            </BentoGrid>

            {/* Info do perfil */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center text-lg font-bold text-primary-400">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user?.name}</p>
                    <p className="text-sm text-zinc-500">{user?.email}</p>
                    <p className="text-xs font-mono text-primary-400 mt-0.5 uppercase">{user?.perfil}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
