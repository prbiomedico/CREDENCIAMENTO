import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Building2, FileCheck, Clock, TrendingUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_companies: 0,
    pending_companies: 0,
    approved_companies: 0,
    total_portarias: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total de Empresas',
      value: stats.total_companies,
      icon: Building2,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      title: 'Pendentes',
      value: stats.pending_companies,
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      title: 'Aprovadas',
      value: stats.approved_companies,
      icon: FileCheck,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Portarias',
      value: stats.total_portarias,
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="dashboard-page">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Dashboard</h1>
          <p className="text-zinc-400">Visão geral do sistema de credenciamento</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, idx) => (
            <Card
              key={idx}
              data-testid={`stat-card-${idx}`}
              className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold font-mono">
                    {loading ? '...' : stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
          <CardHeader>
            <CardTitle className="text-xl font-heading">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                data-testid="quick-action-new-company"
                onClick={() => navigate('/empresas')}
                className="bg-orange-500 hover:bg-orange-600 text-white h-14 justify-start button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Empresa
              </Button>
              <Button
                data-testid="quick-action-search-portarias"
                onClick={() => navigate('/portarias')}
                variant="outline"
                className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white h-14 justify-start"
              >
                <Building2 className="h-5 w-5 mr-2" />
                Buscar Portarias
              </Button>
              <Button
                data-testid="quick-action-view-documents"
                onClick={() => navigate('/documentos')}
                variant="outline"
                className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white h-14 justify-start"
              >
                <FileCheck className="h-5 w-5 mr-2" />
                Gerenciar Documentos
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-xl font-heading">Sobre o SIGCR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-zinc-400">
              <p>
                O Sistema Integrado de Gestão de Credenciamento de Registradoras oferece ferramentas
                completas para gerenciar todo o processo de credenciamento conforme a Resolução CONTRAN.
              </p>
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div>
                  <h3 className="text-white font-semibold mb-2">Requisitos Jurídicos</h3>
                  <ul className="space-y-1 text-sm">
                    <li>• CNPJ e documentos legais</li>
                    <li>• Certidões fiscais</li>
                    <li>• Alvará de funcionamento</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">Requisitos Técnicos</h3>
                  <ul className="space-y-1 text-sm">
                    <li>• ISO 27001 e ISO 27301</li>
                    <li>• Política de segurança</li>
                    <li>• Plano de recuperação</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;