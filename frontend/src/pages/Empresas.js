import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, Building2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Empresas = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', cnpj: '' });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API}/companies`, { withCredentials: true });
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/companies`, formData, { withCredentials: true });
      toast.success('Empresa cadastrada com sucesso!');
      setDialogOpen(false);
      setFormData({ name: '', cnpj: '' });
      fetchCompanies();
    } catch (error) {
      console.error('Error creating company:', error);
      toast.error('Erro ao cadastrar empresa');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pendente', icon: Clock, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      approved: { label: 'Aprovada', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      rejected: { label: 'Rejeitada', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge className={`${config.className} font-mono uppercase text-xs px-2 py-0.5`}>
        <config.icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="empresas-page">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Empresas</h1>
            <p className="text-zinc-400">Gerencie as empresas registradoras cadastradas</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="new-company-btn"
                className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Cadastrar Nova Empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="name" className="text-zinc-300">Nome da Empresa</Label>
                  <Input
                    id="name"
                    data-testid="company-name-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cnpj" className="text-zinc-300">CNPJ</Label>
                  <Input
                    id="cnpj"
                    data-testid="company-cnpj-input"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <Button
                  data-testid="submit-company-btn"
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white button-shadow"
                >
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Companies List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-zinc-400">Carregando empresas...</p>
          </div>
        ) : companies.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-4">Nenhuma empresa cadastrada</p>
              <Button
                data-testid="empty-state-add-btn"
                onClick={() => setDialogOpen(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Cadastrar Primeira Empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => (
              <Card
                key={company.company_id}
                data-testid={`company-card-${company.company_id}`}
                className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors group"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold mb-1">{company.name}</CardTitle>
                      <p className="text-sm font-mono text-zinc-500">{company.cnpj}</p>
                    </div>
                    {getStatusBadge(company.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-zinc-500">
                    <p>Cadastrado em: {new Date(company.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Empresas;