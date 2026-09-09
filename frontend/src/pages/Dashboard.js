import { MapaNacional } from '../components/ui/interactive-map';
import AppMenuBar from '../components/ui/app-menu-bar';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import EmpresaRegistradora from './EmpresaRegistradora';
import { Building2, CreditCard, Shield, CheckCircle, Clock, AlertCircle, CalendarClock, ArrowRight, ListChecks, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';

// Dashboard mínimo pra Financeira (Fase A) — nada de compliance/vencimento/
// portarias, que são conceitos de registradora. Só o essencial: status do
// próprio credenciamento (via checklist, que já resolve por tipo_empresa) +
// atalho pra tela de documentos.
const DashboardFinanceira = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const api = useApi();

  useEffect(() => {
    api.get('/checklist-contran')
      .then((data) => setChecklist(data))
      .catch(() => setChecklist(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = checklist?.resumo;
  const temChecklist = resumo && resumo.total > 0;
  const total = resumo?.total || 0;
  const aprovados = resumo?.aprovados || 0;
  const enviados = resumo?.enviados || 0;
  const pendentes = resumo?.pendentes || 0;
  const rejeitados = resumo?.rejeitados || 0;
  const progresso = total ? Math.round((aprovados / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight">Painel da Financeira</h1>
          <p className="mt-2 text-sm text-slate-500">Documentação, credenciamento e operação de registros em uma visão executiva.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Itens do checklist', value: total, detail: 'Documentação exigida', icon: ListChecks },
                { label: 'Documentos aprovados', value: aprovados, detail: `${progresso}% concluído`, icon: CheckCircle },
                { label: 'Em análise', value: enviados, detail: 'Enviados ao responsável', icon: Clock },
                { label: 'Pontos de atenção', value: pendentes + rejeitados, detail: `${pendentes} pendentes · ${rejeitados} rejeitados`, icon: AlertCircle },
              ].map((item) => (
                <Card key={item.label} className="bg-white"><CardContent className="p-4"><div className="flex items-start justify-between"><p className="text-xs font-medium text-slate-500">{item.label}</p><item.icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></CardContent></Card>
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Andamento documental</CardTitle><p className="text-xs text-slate-500">Evolução do checklist necessário para a operação.</p></CardHeader><CardContent>
                {temChecklist ? <div className="space-y-5"><div><div className="mb-2 flex justify-between text-xs"><span className="text-slate-600">Progresso aprovado</span><span className="font-semibold">{aprovados}/{total}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${progresso}%` }} /></div></div><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-md bg-emerald-50 p-3"><p className="text-xl font-semibold text-emerald-700">{aprovados}</p><p className="text-xs text-emerald-700">Aprovados</p></div><div className="rounded-md bg-amber-50 p-3"><p className="text-xl font-semibold text-amber-700">{enviados}</p><p className="text-xs text-amber-700">Em análise</p></div><div className="rounded-md bg-slate-100 p-3"><p className="text-xl font-semibold text-slate-700">{pendentes}</p><p className="text-xs text-slate-600">Pendentes</p></div></div></div> : <p className="py-8 text-sm text-slate-500">A lista de documentos exigidos ainda não foi publicada.</p>}
              </CardContent></Card>
              <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Ações operacionais</CardTitle><p className="text-xs text-slate-500">Atalhos para as rotinas mais importantes.</p></CardHeader><CardContent className="space-y-2"><Button onClick={() => navigate('/documentos')} variant="outline" className="w-full justify-between">Gerenciar documentos <ArrowRight className="h-4 w-4" /></Button><Button onClick={() => navigate('/registro-contrato')} variant="outline" className="w-full justify-between">Registrar contrato <ArrowRight className="h-4 w-4" /></Button><Button onClick={() => navigate('/portarias')} variant="outline" className="w-full justify-between">Consultar transparência <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [vencimentoResumo, setVencimentoResumo] = useState({ vencendo: [], vencidos: [] });
  const [loading, setLoading] = useState(true);
  const { user, initialized } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
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
  }, [api]);

  const fetchVencimentoResumo = useCallback(async () => {
    try {
      const data = await api.get('/documentos/vencimento-resumo');
      setVencimentoResumo({
        vencendo: Array.isArray(data?.vencendo) ? data.vencendo : [],
        vencidos: Array.isArray(data?.vencidos) ? data.vencidos : [],
      });
    } catch {
      setVencimentoResumo({ vencendo: [], vencidos: [] });
    }
  }, [api]);

  useEffect(() => {
    if (!initialized || !user || ['financeira', 'registradora'].includes(user.perfil)) return;
    fetchStats();
    fetchVencimentoResumo();
  }, [fetchStats, fetchVencimentoResumo, initialized, user]);

  // A visão executiva da própria registradora é o dashboard canônico desse
  // perfil. A rota histórica /registradoras-empresa continua apontando para
  // o mesmo componente para preservar bookmarks e links já distribuídos.
  if (user?.perfil === 'registradora') return <EmpresaRegistradora />;
  if (user?.perfil === 'financeira') return <DashboardFinanceira />;

  const totalCompliance = (stats?.compliance_verde || 0) + (stats?.compliance_amarelo || 0) + (stats?.compliance_vermelho || 0);
  const percentualCompliance = totalCompliance ? Math.round(((stats?.compliance_verde || 0) / totalCompliance) * 100) : 0;
  const documentosCriticos = [...vencimentoResumo.vencidos, ...vencimentoResumo.vencendo];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight">Painel do DETRAN</h1>
          <p className="mt-2 text-sm text-slate-500">Empresas, atos regulatórios e conformidade documental na sua área de atuação.</p>
          <div className="mt-4">
            <AppMenuBar />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Registradoras', value: stats?.total_registradoras || 0, detail: 'Empresas na área de atuação', icon: Building2, to: '/registradoras' },
                { label: 'Financeiras', value: stats?.total_financeiras || 0, detail: 'Instituições vinculadas', icon: CreditCard, to: '/financeiras' },
                { label: 'Portarias vigentes', value: stats?.active_portarias || 0, detail: 'Atos regulatórios ativos', icon: Landmark, to: '/portarias?status=vigente' },
                { label: 'Pendências documentais', value: stats?.pending_validations || 0, detail: 'Itens aguardando validação', icon: AlertCircle, to: '/registradoras?pendencias=1' },
              ].map((item) => (
                <Card key={item.label} onClick={() => item.to && navigate(item.to)} className="cursor-pointer bg-white transition-colors hover:border-slate-400"><CardContent className="p-4"><div className="flex items-start justify-between"><p className="text-xs font-medium text-slate-500">{item.label}</p><item.icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></CardContent></Card>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="bg-white"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Shield className="h-4 w-4 text-slate-500" />Conformidade das registradoras</CardTitle><p className="text-xs text-slate-500">Situação documental consolidada no escopo atual.</p></CardHeader><CardContent className="space-y-5">
                <div><div className="mb-2 flex justify-between text-xs"><span className="text-slate-600">Empresas conformes</span><span className="font-semibold">{stats?.compliance_verde || 0}/{totalCompliance}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${percentualCompliance}%` }} /></div></div>
                <div className="grid grid-cols-3 gap-3 text-center"><button onClick={() => navigate('/registradoras?compliance=valido')} className="rounded-md bg-emerald-50 p-3"><p className="text-2xl font-semibold text-emerald-700">{stats?.compliance_verde || 0}</p><p className="text-xs text-emerald-700">Conformes</p></button><button onClick={() => navigate('/registradoras?compliance=vencendo')} className="rounded-md bg-amber-50 p-3"><p className="text-2xl font-semibold text-amber-700">{stats?.compliance_amarelo || 0}</p><p className="text-xs text-amber-700">Atenção</p></button><button onClick={() => navigate('/registradoras?compliance=vencido')} className="rounded-md bg-red-50 p-3"><p className="text-2xl font-semibold text-red-700">{stats?.compliance_vermelho || 0}</p><p className="text-xs text-red-700">Críticos</p></button></div>
              </CardContent></Card>

              <Card className="bg-white"><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4 text-slate-500" />Agenda documental</CardTitle><p className="text-xs text-slate-500">Vencimentos que exigem acompanhamento.</p></CardHeader><CardContent>
                <div className="mb-4 grid grid-cols-2 gap-3"><div className="rounded-md bg-amber-50 p-3"><p className="text-2xl font-semibold text-amber-700">{vencimentoResumo.vencendo.length}</p><p className="text-xs text-amber-700">Até 30 dias</p></div><div className="rounded-md bg-red-50 p-3"><p className="text-2xl font-semibold text-red-700">{vencimentoResumo.vencidos.length}</p><p className="text-xs text-red-700">Vencidos</p></div></div>
                <div className="divide-y divide-border rounded-md border border-border">{documentosCriticos.slice(0, 5).map((item) => <div key={`${item.origem}-${item.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5"><span className="truncate text-xs text-slate-700">{item.nome}</span><span className="whitespace-nowrap text-xs font-medium text-slate-500">{item.vencimento ? new Date(item.vencimento).toLocaleDateString('pt-BR') : '—'}</span></div>)}{documentosCriticos.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhum vencimento crítico no momento.</p>}</div>
              </CardContent></Card>
            </div>

            <Card className="mt-4 bg-white"><CardHeader><CardTitle className="text-sm">Operação regulatória</CardTitle><p className="text-xs text-slate-500">Acesso direto aos fluxos de trabalho do DETRAN.</p></CardHeader><CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Button variant="outline" onClick={() => navigate('/detran/conferencia')} className="justify-between">Conferir processos <ArrowRight className="h-4 w-4" /></Button><Button variant="outline" onClick={() => navigate('/estados')} className="justify-between">Acompanhar estados <ArrowRight className="h-4 w-4" /></Button><Button variant="outline" onClick={() => navigate('/credenciamento/documentos')} className="justify-between">Dossiê documental <ArrowRight className="h-4 w-4" /></Button><Button variant="outline" onClick={() => navigate('/criar-evento')} className="justify-between">Criar evento <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
