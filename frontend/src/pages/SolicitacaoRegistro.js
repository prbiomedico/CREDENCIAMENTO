import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { FileText, Plus, Download, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: Clock },
  em_processamento: { label: 'Em Processamento', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Loader2 },
  concluido: { label: 'Concluído', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  rejeitado: { label: 'Rejeitado', bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
};

const emptyFormData = () => ({
  credor_nome: '', credor_documento: '', credor_endereco: '', credor_telefone: '',
  devedor_nome: '', devedor_documento: '', devedor_endereco: '', devedor_telefone: '',
  valor_total_divida: '', local_pagamento: '', data_pagamento: '', taxa_juros: '',
  veiculo_placa: '', veiculo_chassi: '', veiculo_marca_modelo: '', veiculo_ano: '',
});

const SolicitacaoRegistro = () => {
  const { user, initialized, getToken } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(emptyFormData());
  const [contratoPdf, setContratoPdf] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!initialized || !user) return; fetchCompanies(); }, [initialized, user]);
  useEffect(() => { if (!initialized || !user) return; fetchSolicitacoes(); }, [initialized, user]);

  const fetchCompanies = async () => {
    try { await getToken(); } catch {}
    try {
      const response = await axios.get(`${API}/companies`, {
        withCredentials: true,
        params: { tipo_empresa: 'financeira' },
      });
      const list = Array.isArray(response.data) ? response.data : [];
      setCompanies(list);
      setSelectedCompany(list.length > 0 ? list[0].company_id : '');
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  };

  const fetchSolicitacoes = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/solicitacoes-registro`, { withCredentials: true });
      setSolicitacoes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar solicitações:', error);
      toast.error('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyFormData());
    setContratoPdf(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCompany) {
      toast.error('Selecione a empresa financeira solicitante');
      return;
    }
    if (!contratoPdf) {
      toast.error('Anexe o contrato assinado (PDF)');
      return;
    }
    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append('company_id', selectedCompany);
      Object.entries(formData).forEach(([key, value]) => fd.append(key, value));
      fd.append('contrato', contratoPdf);
      await axios.post(`${API}/solicitacoes-registro`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Solicitação de registro enviada!');
      setDialogOpen(false);
      resetForm();
      fetchSolicitacoes();
    } catch (error) {
      console.error('Erro ao criar solicitação:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao enviar solicitação');
    } finally {
      setSalvando(false);
    }
  };

  const baixarArquivo = async (solicitacaoId, tipo) => {
    try {
      const response = await axios.get(`${API}/solicitacoes-registro/${solicitacaoId}/${tipo}`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}_${solicitacaoId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Erro ao baixar arquivo');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight">Registro de Contrato</h1>
              <p className="text-zinc-500 text-sm">Solicite o registro do contrato de financiamento junto à registradora</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-primary-500 hover:bg-primary-600 text-white gap-2" disabled={companies.length === 0}>
                <Plus className="h-4 w-4" />
                Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Solicitação de Registro de Contrato</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {companies.length > 1 && (
                  <div>
                    <Label className="text-zinc-300">Empresa solicitante</Label>
                    <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        {companies.map((c) => (
                          <SelectItem key={c.company_id} value={c.company_id}>
                            {c.nome_fantasia || c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <p className="text-xs text-zinc-500 font-mono uppercase pt-2">Credor (Art. 3º Res. CONTRAN 320/2009)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Nome</Label>
                    <Input value={formData.credor_nome} onChange={(e) => setFormData({ ...formData, credor_nome: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">CPF/CNPJ</Label>
                    <Input value={formData.credor_documento} onChange={(e) => setFormData({ ...formData, credor_documento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Endereço</Label>
                    <Input value={formData.credor_endereco} onChange={(e) => setFormData({ ...formData, credor_endereco: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Telefone</Label>
                    <Input value={formData.credor_telefone} onChange={(e) => setFormData({ ...formData, credor_telefone: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>

                <p className="text-xs text-zinc-500 font-mono uppercase pt-2">Devedor</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Nome</Label>
                    <Input value={formData.devedor_nome} onChange={(e) => setFormData({ ...formData, devedor_nome: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">CPF/CNPJ</Label>
                    <Input value={formData.devedor_documento} onChange={(e) => setFormData({ ...formData, devedor_documento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Endereço</Label>
                    <Input value={formData.devedor_endereco} onChange={(e) => setFormData({ ...formData, devedor_endereco: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Telefone</Label>
                    <Input value={formData.devedor_telefone} onChange={(e) => setFormData({ ...formData, devedor_telefone: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>

                <p className="text-xs text-zinc-500 font-mono uppercase pt-2">Condições da dívida</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Valor total (ou estimativa)</Label>
                    <Input type="number" step="0.01" min="0" value={formData.valor_total_divida} onChange={(e) => setFormData({ ...formData, valor_total_divida: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Taxa de juros</Label>
                    <Input value={formData.taxa_juros} onChange={(e) => setFormData({ ...formData, taxa_juros: e.target.value })} placeholder="Ex: 1,99% a.m." className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Local de pagamento</Label>
                    <Input value={formData.local_pagamento} onChange={(e) => setFormData({ ...formData, local_pagamento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Data de pagamento</Label>
                    <Input type="date" value={formData.data_pagamento} onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>

                <p className="text-xs text-zinc-500 font-mono uppercase pt-2">Veículo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Placa</Label>
                    <Input value={formData.veiculo_placa} onChange={(e) => setFormData({ ...formData, veiculo_placa: e.target.value.toUpperCase() })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Chassi</Label>
                    <Input value={formData.veiculo_chassi} onChange={(e) => setFormData({ ...formData, veiculo_chassi: e.target.value.toUpperCase() })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Marca/Modelo</Label>
                    <Input value={formData.veiculo_marca_modelo} onChange={(e) => setFormData({ ...formData, veiculo_marca_modelo: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Ano</Label>
                    <Input value={formData.veiculo_ano} onChange={(e) => setFormData({ ...formData, veiculo_ano: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <Label className="text-zinc-300 mb-2 block">Contrato assinado (PDF)</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setContratoPdf(e.target.files?.[0] || null)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                    required
                  />
                </div>

                <Button type="submit" disabled={salvando} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
                  {salvando ? 'Enviando...' : 'Enviar Solicitação'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-4">Nenhuma empresa financeira cadastrada</p>
              <p className="text-sm text-zinc-500">Cadastre uma empresa do tipo Financeira primeiro</p>
            </CardContent>
          </Card>
        ) : solicitacoes.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhuma solicitação ainda</p>
              <p className="text-sm text-zinc-600 mt-1">Envie uma nova solicitação de registro de contrato</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solicitacoes.map((sol) => {
              const cfg = STATUS_CONFIG[sol.status] || STATUS_CONFIG.pendente;
              const Icon = cfg.icon;
              const ultimaRejeicao = sol.historico_rejeicoes?.[sol.historico_rejeicoes.length - 1];
              return (
                <Card key={sol.solicitacao_registro_id} className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">{sol.veiculo_placa}</Badge>
                          <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                            <Icon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-1">{sol.devedor_nome}</h3>
                        <p className="text-sm text-zinc-400 mb-2">
                          {sol.veiculo_marca_modelo} {sol.veiculo_ano} · Valor: R$ {Number(sol.valor_total_divida).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        {sol.status === 'concluido' && (
                          <p className="text-xs text-emerald-400 font-mono">Nº registro DETRAN: {sol.numero_registro_detran}</p>
                        )}
                        {sol.status === 'rejeitado' && ultimaRejeicao && (
                          <p className="text-xs text-red-400">Motivo: {ultimaRejeicao.motivo || 'Não informado'}</p>
                        )}
                        <p className="text-xs text-zinc-600 mt-1">Enviado em {new Date(sol.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => baixarArquivo(sol.solicitacao_registro_id, 'contrato')}>
                          <Download className="h-3.5 w-3.5" /> Contrato
                        </Button>
                        {sol.status === 'concluido' && (
                          <Button variant="outline" size="sm" className="border-emerald-800 text-emerald-400 gap-2" onClick={() => baixarArquivo(sol.solicitacao_registro_id, 'comprovante')}>
                            <Download className="h-3.5 w-3.5" /> Comprovante
                          </Button>
                        )}
                      </div>
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

export default SolicitacaoRegistro;
