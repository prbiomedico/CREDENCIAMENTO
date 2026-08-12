import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, Building2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const Empresas = () => {
  const { user, initialized, keycloak, getToken } = useAuth();
  const [companies, setCompanies] = useState([]);
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
    tipo_empresa: 'registradora',
    registradora_id: ''
  });
  const [registradorasDisponiveis, setRegistradorasDisponiveis] = useState([]);

  useEffect(() => { if (!initialized || !user) return; fetchCompanies(); }, [initialized, user]);
  useEffect(() => {
    if (!initialized || !user) return;
    axios.get(`${API}/companies`, { withCredentials: true, params: { tipo_empresa: 'registradora' } })
      .then((res) => setRegistradorasDisponiveis(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [initialized, user]);


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
    registradora_id: ''
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
      registradora_id: editingCompany.registradora_id || ''
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
      const { registradora_id, ...resto } = editFormData;
      const payload = editingCompany.tipo_empresa === 'financeira' && registradora_id
        ? { ...resto, registradora_id }
        : resto;
      await axios.patch(`${API}/companies/${editingCompany.company_id}`, payload, { withCredentials: true });
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

  const fetchCompanies = async () => {
    try { await getToken(); } catch {}
    try {
      const response = await axios.get(`${API}/companies`, { withCredentials: true });
      setCompanies(Array.isArray(response.data) ? response.data : []);
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.tipo_empresa === 'financeira' && !formData.registradora_id) {
      toast.error('Selecione a registradora à qual esta financeira está vinculada');
      return;
    }
    try {
      await axios.post(`${API}/companies`, formData, { withCredentials: true });
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
        tipo_empresa: 'registradora',
        registradora_id: ''
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
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Cadastrar Nova Empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-zinc-300">Razão Social</Label>
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
                    <Label htmlFor="nome_fantasia" className="text-zinc-300">Nome Fantasia</Label>
                    <Input
                      id="nome_fantasia"
                      data-testid="company-fantasia-input"
                      value={formData.nome_fantasia}
                      onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Tipo de Empresa</Label>
                    <Select value={formData.tipo_empresa} onValueChange={(value) => setFormData({ ...formData, tipo_empresa: value, registradora_id: '' })}>
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        <SelectItem value="registradora">Registradora</SelectItem>
                        <SelectItem value="financeira">Financeira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.tipo_empresa === 'financeira' && (
                    <div>
                      <Label className="text-zinc-300">Registradora Vinculada</Label>
                      <Select value={formData.registradora_id} onValueChange={(value) => setFormData({ ...formData, registradora_id: value })}>
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-2">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                          {registradorasDisponiveis.map((r) => (
                            <SelectItem key={r.company_id} value={r.company_id}>{r.nome_fantasia || r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
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
                  <div>
                    <Label htmlFor="email_comercial" className="text-zinc-300">Email Comercial</Label>
                    <Input
                      id="email_comercial"
                      type="email"
                      data-testid="company-email-input"
                      value={formData.email_comercial}
                      onChange={(e) => setFormData({ ...formData, email_comercial: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gestor_contrato" className="text-zinc-300">Gestor do Contrato</Label>
                  <Input
                    id="gestor_contrato"
                    data-testid="company-gestor-input"
                    value={formData.gestor_contrato}
                    onChange={(e) => setFormData({ ...formData, gestor_contrato: e.target.value })}
                    placeholder="Nome completo do gestor"
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endereco" className="text-zinc-300">Endereço</Label>
                    <Input
                      id="endereco"
                      value={formData.endereco}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      placeholder="Endereço"
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsapp" className="text-zinc-300">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="(99) 99999-9999"
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 mb-3 block">DETRANs de Atuação</Label>
                  <div className="grid grid-cols-5 gap-3 max-h-48 overflow-y-auto p-4 bg-zinc-950 border border-zinc-800 rounded-md">
                    {detransOptions.map((detran) => (
                      <div key={detran} className="flex items-center space-x-2">
                        <Checkbox
                          id={`detran-${detran}`}
                          checked={formData.detrans_atuacao.includes(detran)}
                          onCheckedChange={() => handleDetranToggle(detran)}
                          className="border-zinc-700 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                        />
                        <label
                          htmlFor={`detran-${detran}`}
                          className="text-sm text-zinc-300 cursor-pointer"
                        >
                          {detran}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    Selecionados: {formData.detrans_atuacao.length > 0 ? formData.detrans_atuacao.join(', ') : 'Nenhum'}
                  </p>
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

        {/* Edit Company Modal */}
        <Dialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) setEditingCompany(null); }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">Editar Empresa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name" className="text-zinc-300">Razão Social</Label>
                  <Input
                    id="edit-name"
                    data-testid="edit-company-name-input"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-nome_fantasia" className="text-zinc-300">Nome Fantasia</Label>
                  <Input
                    id="edit-nome_fantasia"
                    data-testid="edit-company-fantasia-input"
                    value={editFormData.nome_fantasia}
                    onChange={(e) => setEditFormData({ ...editFormData, nome_fantasia: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
              </div>

              {editingCompany?.tipo_empresa === 'financeira' && (
                <div>
                  <Label className="text-zinc-300">Registradora Vinculada</Label>
                  <Select value={editFormData.registradora_id} onValueChange={(value) => setEditFormData({ ...editFormData, registradora_id: value })}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-2">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      {registradorasDisponiveis.map((r) => (
                        <SelectItem key={r.company_id} value={r.company_id}>{r.nome_fantasia || r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-cnpj" className="text-zinc-300">CNPJ</Label>
                  <Input
                    id="edit-cnpj"
                    data-testid="edit-company-cnpj-input"
                    value={editFormData.cnpj}
                    onChange={(e) => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email_comercial" className="text-zinc-300">Email Comercial</Label>
                  <Input
                    id="edit-email_comercial"
                    type="email"
                    data-testid="edit-company-email-input"
                    value={editFormData.email_comercial}
                    onChange={(e) => setEditFormData({ ...editFormData, email_comercial: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-gestor_contrato" className="text-zinc-300">Gestor do Contrato</Label>
                <Input
                  id="edit-gestor_contrato"
                  data-testid="edit-company-gestor-input"
                  value={editFormData.gestor_contrato}
                  onChange={(e) => setEditFormData({ ...editFormData, gestor_contrato: e.target.value })}
                  placeholder="Nome completo do gestor"
                  className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-endereco" className="text-zinc-300">Endereço</Label>
                  <Input
                    id="edit-endereco"
                    value={editFormData.endereco}
                    onChange={(e) => setEditFormData({ ...editFormData, endereco: e.target.value })}
                    placeholder="Endereço"
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-whatsapp" className="text-zinc-300">WhatsApp</Label>
                  <Input
                    id="edit-whatsapp"
                    value={editFormData.whatsapp}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsapp: e.target.value })}
                    placeholder="(99) 99999-9999"
                    className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                  />
                </div>
              </div>

              <div>
                <Label className="text-zinc-300 mb-3 block">DETRANs de Atuação</Label>
                <div className="grid grid-cols-5 gap-3 max-h-48 overflow-y-auto p-4 bg-zinc-950 border border-zinc-800 rounded-md">
                  {detransOptions.map((detran) => (
                    <div key={detran} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-detran-${detran}`}
                        checked={editFormData.detrans_atuacao.includes(detran)}
                        onCheckedChange={() => handleEditDetranToggle(detran)}
                        className="border-zinc-700 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                      />
                      <label
                        htmlFor={`edit-detran-${detran}`}
                        className="text-sm text-zinc-300 cursor-pointer"
                      >
                        {detran}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Selecionados: {editFormData.detrans_atuacao.length > 0 ? editFormData.detrans_atuacao.join(', ') : 'Nenhum'}
                </p>
              </div>

              <Button
                data-testid="submit-edit-company-btn"
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
                Salvar Alterações
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Companies List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-zinc-400">Carregando empresas...</p>
          </div>
        ) : sessaoExpirada ? (
          <Card className="bg-amber-950/20 border-amber-900/50">
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-amber-700 mx-auto mb-4" />
              <p className="text-amber-400 mb-4">Sessão expirada</p>
              <p className="text-sm text-zinc-500 mb-4">Não foi possível confirmar sua autenticação — isso não significa que você não tem empresas cadastradas.</p>
              <Button onClick={() => window.location.reload()} className="bg-orange-500 hover:bg-orange-600 text-white">
                Recarregar página
              </Button>
            </CardContent>
          </Card>
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
          <div className="grid grid-cols-1 gap-6">
            {companies.map((company) => (
              <Card
                key={company.company_id}
                data-testid={`company-card-${company.company_id}`}
                className="bg-zinc-900/50 border-zinc-800 hover:border-orange-500/30 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl font-semibold">{company.name}</CardTitle>
                        {getStatusBadge(company.status)}
                      </div>
                      <p className="text-sm text-zinc-400 mb-1">Nome Fantasia: {company.nome_fantasia}</p>
                      <p className="text-sm font-mono text-zinc-500">CNPJ: {company.cnpj}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-500 mb-1">Email Comercial:</p>
                      <p className="text-zinc-300">{company.email_comercial}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500 mb-1">Gestor do Contrato:</p>
                      <p className="text-zinc-300">{company.gestor_contrato}</p>
                    </div>
                  </div>
                  {company.detrans_atuacao && company.detrans_atuacao.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-zinc-500 mb-2">DETRANs de Atuação:</p>
                      <div className="flex flex-wrap gap-2">
                        {company.detrans_atuacao.map((detran) => (
                          <Badge key={detran} className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                            DETRAN-{detran}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-zinc-600 mt-4">
                    Cadastrado em: {new Date(company.created_at).toLocaleDateString('pt-BR')}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={()=>{setEditingCompany(company);setShowEditModal(true);}}>Editar</Button>
                  <Button size="sm" className="bg-red-900/30 text-red-400 border border-red-800 hover:bg-red-900" onClick={()=>handleDelete(company.company_id)}>Excluir</Button>
                </div>
                <div style={{display:'none'}}>
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
