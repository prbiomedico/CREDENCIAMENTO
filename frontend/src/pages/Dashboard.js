import GradientMenu from '../components/ui/gradient-menu';
import { MapaNacional } from '../components/ui/interactive-map';
import VaporizeTextCycle from '../components/ui/vapour-text-effect';
import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Building2, FileText, Search, TrendingUp, Shield, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { toast } from 'sonner';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, initialized } = useAuth();
  const api = useApi();

  useEffect(() => {
    if (!initialized || !user) return;
    fetchStats();
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

  const SEMAFORO = [
    { label: 'Conformes', value: stats?.compliance_verde || 0, color: 'emerald', icon: CheckCircle },
    { label: 'Atenção', value: stats?.compliance_amarelo || 0, color: 'orange', icon: Clock },
    { label: 'Crítico', value: stats?.compliance_vermelho || 0, color: 'red', icon: AlertCircle },
  ];

  const CARDS = [
    { label: 'Empresas', value: stats?.total_companies || 0, icon: Building2, color: 'blue' },
    { label: 'Documentos', value: stats?.total_documents || 0, icon: FileText, color: 'orange' },
    { label: 'Pendências', value: stats?.pending_validations || 0, icon: Clock, color: 'yellow' },
    { label: 'Portarias', value: stats?.active_portarias || 0, icon: Search, color: 'emerald' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold tracking-tight">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Bem-vindo ao sigcr SIGCR — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      {/* VaporizeText Hero  21st.dev */}
      <div style={{ width: "100%", height: "80px", position: "relative", marginBottom: "8px" }}>
        <VaporizeTextCycle
          texts={["Credenciamento", "Compliance", "SIGCR"]}
          font={{ fontFamily: "Inter, sans-serif", fontSize: "36px", fontWeight: 700 }}
          color="rgb(249, 115, 22)"
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
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Cards principais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {CARDS.map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">{label}</p>
                      <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
                        <Icon className={`h-4 w-4 text-${color}-400`} />
                      </div>
                    </div>
                    <p className={`text-3xl font-bold font-mono text-${color}-400`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Semáforo de Compliance */}
            <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-500" />
                  Semáforo de Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {SEMAFORO.map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className={`p-4 rounded-xl bg-${color}-500/10 border border-${color}-500/20 text-center`}>
                      <Icon className={`h-6 w-6 text-${color}-400 mx-auto mb-2`} />
                      <p className={`text-2xl font-bold font-mono text-${color}-400`}>{value}</p>
                      <p className="text-xs text-zinc-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Info do perfil */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-lg font-bold text-orange-400">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user?.name}</p>
                    <p className="text-sm text-zinc-500">{user?.email}</p>
                    <p className="text-xs font-mono text-orange-400 mt-0.5 uppercase">{user?.perfil}</p>
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
