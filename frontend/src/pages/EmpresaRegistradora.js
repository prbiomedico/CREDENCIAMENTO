import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, Building2, CheckCircle, XCircle, Clock, Download, FileText, MapPinned, ShieldCheck, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const detransOptions = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Caminho próprio da Registradora — antes compartilhado com Financeira dentro
// de Empresas.js (componente dinâmico por tipo_empresa). Separado em arquivo
// próprio (item 2 do pedido do Pedro), tipo_empresa é sempre 'registradora'
// aqui, sem seletor. Ver EmpresaFinanceira.js pro caminho da Financeira.
const EmpresaRegistradora = () => {
  const { user, initialized, getToken } = useAuth();
  const podeCriarEmpresa = user?.perfil === 'sigcr_admin';
  const [companies, setCompanies] = useState([]);
  const [documentosHomologacao, setDocumentosHomologacao] = useState({});
  const [credenciamentos, setCredenciamentos] = useState({});
  const [filtroDocumento, setFiltroDocumento] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [baixandoDocumento, setBaixandoDocumento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    nome_fantasia: '',
    cnpj: '',
    email_comercial: '',
    gestor_contrato: '',
    endereco: '',
    whatsapp: '',
    detrans_atuacao: [],
  });


  const [showEditModal, setShowEditModal] = React.useState(false);
  const [editingCompany, setEditingCompany] = React.useState(null);
  const [editFormData, setEditFormData] = React.useState({
    name: '',
    nome_fantasia: '',
    cnpj: '',
    email_comercial: '',
    gestor_contrato: '',
    endereco: '',
    whatsapp: '',
    detrans_atuacao: [],
  });

  useEffect(() => {
    if (!editingCompany) return;
    setEditFormData({
      name: editingCompany.name || '',
      nome_fantasia: editingCompany.nome_fantasia || '',
      cnpj: editingCompany.cnpj || '',
      email_comercial: editingCompany.email_comercial || '',
      gestor_contrato: editingCompany.gestor_contrato || '',
      endereco: editingCompany.endereco || '',
      whatsapp: editingCompany.whatsapp || '',
      detrans_atuacao: editingCompany.detrans_atuacao || [],
    });
  }, [editingCompany]);

  const handleEditDetranToggle = (detran) => {
    setEditFormData(prev => ({
      ...prev,
      detrans_atuacao: prev.detrans_atuacao.includes(detran)
        ? prev.detrans_atuacao.filter(d => d !== detran)
        : [...prev.detrans_atuacao, detran]
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API}/companies/${editingCompany.company_id}`, editFormData, { withCredentials: true });
      toast.success('Empresa atualizada com sucesso!');
      setShowEditModal(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error) {
      console.error('Error updating company:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar empresa');
    }
  };

  const handleDelete = async (companyId) => {
    if (!window.confirm('Confirma exclusao desta empresa?')) return;
    try { await getToken(); } catch {}
    try {
      await axios.delete(`${API}/companies/${companyId}`, { withCredentials: true });
      toast.success('Empresa excluida!');
      fetchCompanies();
    } catch { toast.error('Erro ao excluir'); }
  };

  const fetchCompanies = useCallback(async () => {
    try { await getToken(); } catch {}
    try {
      const response = await axios.get(`${API}/companies`, { withCredentials: true, params: { tipo_empresa: 'registradora' } });
      const empresas = Array.isArray(response.data) ? response.data : [];
      setCompanies(empresas);
      const dadosOperacionais = await Promise.all(empresas.map(async (company) => {
        try {
          const [docsResponse, credResponse] = await Promise.all([
            axios.get(`${API}/companies/${company.company_id}/documentos-homologacao`, { withCredentials: true }),
            axios.get(`${API}/companies/${company.company_id}/credenciamentos-resumo`, { withCredentials: true }),
          ]);
          return [
            company.company_id,
            Array.isArray(docsResponse.data) ? docsResponse.data : [],
            Array.isArray(credResponse.data) ? credResponse.data : [],
          ];
        } catch (error) {
          console.error('Error fetching homologation documents:', error);
          return [company.company_id, [], []];
        }
      }));
      setDocumentosHomologacao(Object.fromEntries(dadosOperacionais.map(([id, docs]) => [id, docs])));
      setCredenciamentos(Object.fromEntries(dadosOperacionais.map(([id, , creds]) => [id, creds])));
      setSessaoExpirada(false);
    } catch (error) {
      console.error('Error fetching companies:', error);
      if (error?.response?.status === 401) {
        setSessaoExpirada(true);
        toast.error('Sessão expirada — recarregue a página');
      } else {
        toast.error('Erro ao carregar empresas');
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { if (!initialized || !user) return; fetchCompanies(); }, [initialized, user, fetchCompanies]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/companies`, { ...formData, tipo_empresa: 'registradora' }, { withCredentials: true });
      toast.success('Empresa cadastrada com sucesso!');
      setDialogOpen(false);
      setFormData({
        name: '',
        nome_fantasia: '',
        cnpj: '',
        email_comercial: '',
        gestor_contrato: '',
        endereco: '',
        whatsapp: '',
        detrans_atuacao: [],
      });
      fetchCompanies();
    } catch (error) {
      console.error('Error creating company:', error);
      if (error?.response?.status === 401) {
        toast.error('Sessão expirada — recarregue a página e tente de novo');
      } else {
        toast.error(error?.response?.data?.detail || 'Erro ao cadastrar empresa');
      }
    }
  };

  const handleDetranToggle = (detran) => {
    setFormData(prev => ({
      ...prev,
      detrans_atuacao: prev.detrans_atuacao.includes(detran)
        ? prev.detrans_atuacao.filter(d => d !== detran)
        : [...prev.detrans_atuacao, detran]
    }));
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

  const handleDownloadDocumento = async (companyId, documento) => {
    setBaixandoDocumento(documento.documento_id);
    try {
      const response = await axios.get(
        `${API}/companies/${companyId}/documentos-homologacao/${documento.documento_id}/download`,
        { withCredentials: true, responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', documento.file_name || `${documento.nome}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading homologation document:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao baixar documento');
    } finally {
      setBaixandoDocumento(null);
    }
  };

  const getCredenciamentoStatus = (status) => ({
    ativo: { label: 'Ativo', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    sem_efeito: { label: 'Em revisão', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    pendente: { label: 'Pendente', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  }[status] || { label: status || 'Pendente', className: 'border-slate-200 bg-slate-100 text-slate-700' });

  const formatarValidade = (validade) => {
    if (!validade) return 'A confirmar';
    const data = new Date(validade);
    return Number.isNaN(data.getTime()) ? 'A confirmar' : data.toLocaleDateString('pt-BR');
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="empresa-registradora-page">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Painel da Registradora</h1>
            <p className="text-slate-600">Cobertura nacional, situação dos credenciamentos e documentos oficiais.</p>
          </div>
          {podeCriarEmpresa && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="new-company-btn"
                className="bg-primary-500 hover:bg-primary-600 text-white button-shadow"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Cadastrar Empresa Registradora</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-slate-700">Razão Social</Label>
                    <Input
                      id="name"
                      data-testid="company-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="nome_fantasia" className="text-slate-700">Nome Fantasia</Label>
                    <Input
                      id="nome_fantasia"
                      data-testid="company-fantasia-input"
                      value={formData.nome_fantasia}
                      onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cnpj" className="text-slate-700">CNPJ</Label>
                    <Input
                      id="cnpj"
                      data-testid="company-cnpj-input"
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email_comercial" className="text-slate-700">Email Comercial</Label>
                    <Input
                      id="email_comercial"
                      type="email"
                      data-testid="company-email-input"
                      value={formData.email_comercial}
                      onChange={(e) => setFormData({ ...formData, email_comercial: e.target.value })}
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gestor_contrato" className="text-slate-700">Gestor do Contrato</Label>
                  <Input
                    id="gestor_contrato"
                    data-testid="company-gestor-input"
                    value={formData.gestor_contrato}
                    onChange={(e) => setFormData({ ...formData, gestor_contrato: e.target.value })}
                    placeholder="Nome completo do gestor"
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endereco" className="text-slate-700">Endereço</Label>
                    <Input
                      id="endereco"
                      value={formData.endereco}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      placeholder="Endereço"
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsapp" className="text-slate-700">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="(99) 99999-9999"
                      className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-slate-700 mb-3 block">DETRANs de Atuação</Label>
                  <div className="grid grid-cols-5 gap-3 max-h-48 overflow-y-auto p-4 bg-background border border-border rounded-md">
                    {detransOptions.map((detran) => (
                      <div key={detran} className="flex items-center space-x-2">
                        <Checkbox
                          id={`detran-${detran}`}
                          checked={formData.detrans_atuacao.includes(detran)}
                          onCheckedChange={() => handleDetranToggle(detran)}
                          className="border-input data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500"
                        />
                        <label
                          htmlFor={`detran-${detran}`}
                          className="text-sm text-slate-700 cursor-pointer"
                        >
                          {detran}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Selecionados: {formData.detrans_atuacao.length > 0 ? formData.detrans_atuacao.join(', ') : 'Nenhum'}
                  </p>
                </div>

                <Button
                  data-testid="submit-company-btn"
                  type="submit"
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white button-shadow"
                >
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>}
        </div>

        {/* Edit Company Modal */}
        <Dialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) setEditingCompany(null); }}>
          <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">Editar Empresa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name" className="text-slate-700">Razão Social</Label>
                  <Input
                    id="edit-name"
                    data-testid="edit-company-name-input"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-nome_fantasia" className="text-slate-700">Nome Fantasia</Label>
                  <Input
                    id="edit-nome_fantasia"
                    data-testid="edit-company-fantasia-input"
                    value={editFormData.nome_fantasia}
                    onChange={(e) => setEditFormData({ ...editFormData, nome_fantasia: e.target.value })}
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-cnpj" className="text-slate-700">CNPJ</Label>
                  <Input
                    id="edit-cnpj"
                    data-testid="edit-company-cnpj-input"
                    value={editFormData.cnpj}
                    onChange={(e) => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email_comercial" className="text-slate-700">Email Comercial</Label>
                  <Input
                    id="edit-email_comercial"
                    type="email"
                    data-testid="edit-company-email-input"
                    value={editFormData.email_comercial}
                    onChange={(e) => setEditFormData({ ...editFormData, email_comercial: e.target.value })}
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-gestor_contrato" className="text-slate-700">Gestor do Contrato</Label>
                <Input
                  id="edit-gestor_contrato"
                  data-testid="edit-company-gestor-input"
                  value={editFormData.gestor_contrato}
                  onChange={(e) => setEditFormData({ ...editFormData, gestor_contrato: e.target.value })}
                  placeholder="Nome completo do gestor"
                  className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-endereco" className="text-slate-700">Endereço</Label>
                  <Input
                    id="edit-endereco"
                    value={editFormData.endereco}
                    onChange={(e) => setEditFormData({ ...editFormData, endereco: e.target.value })}
                    placeholder="Endereço"
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-whatsapp" className="text-slate-700">WhatsApp</Label>
                  <Input
                    id="edit-whatsapp"
                    value={editFormData.whatsapp}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsapp: e.target.value })}
                    placeholder="(99) 99999-9999"
                    className="bg-background border-border focus:border-primary-500 text-foreground mt-2"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-700 mb-3 block">DETRANs de Atuação</Label>
                <div className="grid grid-cols-5 gap-3 max-h-48 overflow-y-auto p-4 bg-background border border-border rounded-md">
                  {detransOptions.map((detran) => (
                    <div key={detran} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-detran-${detran}`}
                        checked={editFormData.detrans_atuacao.includes(detran)}
                        onCheckedChange={() => handleEditDetranToggle(detran)}
                        className="border-input data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500"
                      />
                      <label
                        htmlFor={`edit-detran-${detran}`}
                        className="text-sm text-slate-700 cursor-pointer"
                      >
                        {detran}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Selecionados: {editFormData.detrans_atuacao.length > 0 ? editFormData.detrans_atuacao.join(', ') : 'Nenhum'}
                </p>
              </div>

              <Button
                data-testid="submit-edit-company-btn"
                type="submit"
                className="w-full bg-primary-500 hover:bg-primary-600 text-white button-shadow"
              >
                Salvar Alterações
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Companies List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-slate-600">Carregando empresas...</p>
          </div>
        ) : sessaoExpirada ? (
          <Card className="bg-amber-950/20 border-amber-900/50">
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-amber-700 mx-auto mb-4" />
              <p className="text-amber-400 mb-4">Sessão expirada</p>
              <p className="text-sm text-slate-500 mb-4">Não foi possível confirmar sua autenticação — isso não significa que você não tem empresas cadastradas.</p>
              <Button onClick={() => window.location.reload()} className="bg-primary-500 hover:bg-primary-600 text-white">
                Recarregar página
              </Button>
            </CardContent>
          </Card>
        ) : companies.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">Nenhuma empresa cadastrada</p>
              {podeCriarEmpresa ? (
                <Button
                  data-testid="empty-state-add-btn"
                  onClick={() => setDialogOpen(true)}
                  className="bg-primary-500 hover:bg-primary-600 text-white button-shadow"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Cadastrar Primeira Empresa
                </Button>
              ) : (
                <p className="text-sm text-slate-500">Entre em contato com a administração do SIGCR para revisar o vínculo da sua conta.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {companies.map((company) => {
              const docs = documentosHomologacao[company.company_id] || [];
              const creds = credenciamentos[company.company_id] || [];
              const docsPorUf = Object.fromEntries(docs.map((doc) => [doc.estado_sigla, doc]));
              const ativos = creds.filter((cred) => cred.status === 'ativo').length;
              const revisao = creds.filter((cred) => cred.status === 'sem_efeito').length;
              const pendentes = creds.filter((cred) => cred.status === 'pendente').length;
              const linhas = creds.filter((cred) => {
                const busca = filtroDocumento.trim().toUpperCase();
                const combinaBusca = !busca || cred.estado_sigla?.includes(busca) || cred.extrato_contrato?.toUpperCase().includes(busca);
                const combinaStatus = filtroStatus === 'todos' || cred.status === filtroStatus;
                return combinaBusca && combinaStatus;
              });
              const chartData = [
                { nome: 'Ativos', total: ativos, fill: '#059669' },
                { nome: 'Em revisão', total: revisao, fill: '#d97706' },
                { nome: 'Pendentes', total: pendentes, fill: '#64748b' },
              ];
              return (
              <Card
                key={company.company_id}
                data-testid={`company-card-${company.company_id}`}
                className="bg-card border-border hover:border-primary-500/30 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl font-semibold">{company.name}</CardTitle>
                        {getStatusBadge(company.status)}
                      </div>
                      <p className="text-sm text-slate-600 mb-1">Nome Fantasia: {company.nome_fantasia}</p>
                      <p className="text-sm font-mono text-slate-500">CNPJ: {company.cnpj}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 mb-1">Email Comercial:</p>
                      <p className="text-slate-700">{company.email_comercial}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">Gestor do Contrato:</p>
                      <p className="text-slate-700">{company.gestor_contrato}</p>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Estados acompanhados', value: creds.length, detail: 'Cobertura cadastrada', icon: MapPinned },
                      { label: 'Credenciamentos ativos', value: ativos, detail: `${creds.length ? Math.round((ativos / creds.length) * 100) : 0}% da cobertura`, icon: ShieldCheck },
                      { label: 'Documentos oficiais', value: docs.length, detail: 'Disponíveis para download', icon: FileText },
                      { label: 'Pontos de atenção', value: revisao + pendentes, detail: `${revisao} em revisão · ${pendentes} pendente`, icon: AlertTriangle },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-medium text-slate-500">{item.label}</p>
                          <item.icon className="h-4 w-4 text-slate-400" />
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
                    <div className="rounded-lg border border-border bg-white p-5">
                      <div className="mb-5">
                        <p className="text-sm font-semibold text-slate-900">Situação da cobertura</p>
                        <p className="mt-1 text-xs text-slate-500">Distribuição real dos credenciamentos por status.</p>
                      </div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis type="category" dataKey="nome" width={76} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                            <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={24}>
                              {chartData.map((item) => <Cell key={item.nome} fill={item.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-white p-5">
                      <p className="text-sm font-semibold text-slate-900">Visão executiva</p>
                      <p className="mt-1 text-xs text-slate-500">Leitura rápida da operação nacional da registradora.</p>
                      <div className="mt-5 space-y-4">
                        <div>
                          <div className="mb-2 flex justify-between text-xs"><span className="text-slate-600">Cobertura ativa</span><span className="font-semibold text-slate-900">{ativos}/{creds.length}</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${creds.length ? (ativos / creds.length) * 100 : 0}%` }} /></div>
                        </div>
                        <div>
                          <div className="mb-2 flex justify-between text-xs"><span className="text-slate-600">Estados com documento oficial</span><span className="font-semibold text-slate-900">{docs.length}/{creds.length}</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${creds.length ? (docs.length / creds.length) * 100 : 0}%` }} /></div>
                        </div>
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          <span className="font-semibold">Acompanhamento:</span> {revisao + pendentes === 0 ? 'nenhuma pendência identificada.' : `${revisao + pendentes} estado(s) precisam de revisão documental ou conclusão do processo.`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white" data-testid={`homologation-documents-${company.company_id}`}>
                    <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Credenciamentos por estado</p>
                        <p className="mt-1 text-xs text-slate-500">Status, validade e documento oficial em uma única visão operacional.</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input value={filtroDocumento} onChange={(event) => setFiltroDocumento(event.target.value)} placeholder="Buscar UF ou ato..." className="h-9 w-full pl-9 sm:w-56" />
                        </div>
                        <select value={filtroStatus} onChange={(event) => setFiltroStatus(event.target.value)} className="h-9 rounded-md border border-input bg-white px-3 text-sm text-slate-700">
                          <option value="todos">Todos os status</option>
                          <option value="ativo">Ativos</option>
                          <option value="sem_efeito">Em revisão</option>
                          <option value="pendente">Pendentes</option>
                        </select>
                      </div>
                    </div>
                    <Table>
                      <TableHeader><TableRow><TableHead>UF</TableHead><TableHead>Status</TableHead><TableHead>Ato / situação</TableHead><TableHead>Validade</TableHead><TableHead>Documento</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {linhas.map((cred) => {
                          const documento = docsPorUf[cred.estado_sigla];
                          const status = getCredenciamentoStatus(cred.status);
                          return (
                            <TableRow key={cred.credenciamento_id}>
                              <TableCell><Badge variant="outline" className="font-mono">{cred.estado_sigla}</Badge></TableCell>
                              <TableCell><Badge variant="outline" className={status.className}>{status.label}</Badge></TableCell>
                              <TableCell className="max-w-sm"><p className="line-clamp-2 text-xs leading-5 text-slate-600">{cred.extrato_contrato}</p></TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-slate-600">{formatarValidade(cred.validade)}</TableCell>
                              <TableCell><p className="max-w-48 truncate text-xs text-slate-600">{documento?.tipo || 'Não disponível'}</p></TableCell>
                              <TableCell className="text-right">
                                <Button type="button" size="sm" variant="outline" disabled={!documento || baixandoDocumento === documento.documento_id} onClick={() => documento && handleDownloadDocumento(company.company_id, documento)} className="gap-2">
                                  <Download className="h-4 w-4" />{baixandoDocumento === documento?.documento_id ? 'Baixando...' : 'Baixar'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {linhas.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">Nenhum credenciamento encontrado com os filtros selecionados.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                    <div className="border-t border-border px-4 py-3 text-xs text-slate-500">Exibindo {linhas.length} de {creds.length} estados acompanhados.</div>
                  </div>
                  <div className="text-xs text-slate-400 mt-4">
                    Cadastrado em: {new Date(company.created_at).toLocaleDateString('pt-BR')}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={()=>{setEditingCompany(company);setShowEditModal(true);}}>Editar</Button>
                  <Button size="sm" variant="destructive-outline" onClick={()=>handleDelete(company.company_id)}>Excluir</Button>
                </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EmpresaRegistradora;
