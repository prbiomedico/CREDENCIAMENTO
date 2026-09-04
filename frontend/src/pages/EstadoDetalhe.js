import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import DocumentosEstadoTab from '../components/DocumentosEstadoTab';
import QueridoDiarioBusca from '../components/QueridoDiarioBusca';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Ban, Loader2, Plus, Pencil, Trash2, RotateCcw, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const emptyCredForm = () => ({
  company_id: '', extrato_contrato: '', status: 'ativo', validade: '',
  valor_total_registro: '', valor_detran: '', valor_registradora: '',
});

const TIPOS_PORTARIA = [
  { value: 'credenciamento', label: 'Credenciamento' },
  { value: 'descredenciamento', label: 'Descredenciamento' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'outro', label: 'Outro' },
];

const emptyPortariaForm = (estadoSigla) => ({
  title: '', content: '', source: '', detran: estadoSigla, date: new Date().toISOString().split('T')[0],
  numero: '', orgao_emissor: '', estado_sigla: estadoSigla, status: 'vigente',
  link_pdf: '', origem: 'manual', querido_diario_url: '', summary: '', tipo: '',
});

export default function EstadoDetalhe() {
  const { sigla } = useParams();
  const siglaUpper = (sigla || '').toUpperCase();
  const navigate = useNavigate();
  const { user, initialized, isAdmin, isDetran } = useAuth();

  const semAcesso = isDetran && !isAdmin && user?.detran_uf && user.detran_uf !== siglaUpper;

  const [estadoInfo, setEstadoInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro403, setErro403] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [salvandoEstado, setSalvandoEstado] = useState(false);

  const [credenciamentos, setCredenciamentos] = useState([]);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [credForm, setCredForm] = useState(emptyCredForm());
  const [companies, setCompanies] = useState([]);
  const [editandoCredId, setEditandoCredId] = useState(null);

  const [portarias, setPortarias] = useState([]);
  const [portariaDialogOpen, setPortariaDialogOpen] = useState(false);
  const [portariaForm, setPortariaForm] = useState(emptyPortariaForm(siglaUpper));
  const [anexarArquivo, setAnexarArquivo] = useState(false);
  const [arquivoPdf, setArquivoPdf] = useState(null);
  const [salvandoPortaria, setSalvandoPortaria] = useState(false);
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState([]);

  const toggleEmpresaReferenciada = (companyId) => {
    setEmpresasSelecionadas((prev) =>
      prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [...prev, companyId]
    );
  };

  const fetchEstadoInfo = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/estados/${siglaUpper}`, { withCredentials: true });
      setEstadoInfo(response.data);
      setObservacoes(response.data?.estado?.observacoes || '');
      setErro403(false);
    } catch (error) {
      if (error?.response?.status === 403) {
        setErro403(true);
      } else {
        console.error('Erro ao carregar estado:', error);
        toast.error('Erro ao carregar dados do estado');
      }
    } finally {
      setLoading(false);
    }
  }, [siglaUpper]);

  const fetchCredenciamentos = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/estados/${siglaUpper}/credenciamentos`, { withCredentials: true });
      setCredenciamentos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar credenciamentos:', error);
    }
  }, [siglaUpper]);

  const fetchPortarias = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/portarias`, { withCredentials: true, params: { estado_sigla: siglaUpper } });
      setPortarias(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar portarias do estado:', error);
    }
  }, [siglaUpper]);

  const fetchCompanies = useCallback(async () => {
    try {
      // Credenciamento por estado é sempre por registradora — financeira não
      // participa desse fluxo, independente do badge/perfil ativo do usuário.
      const response = await axios.get(`${API}/companies`, {
        withCredentials: true,
        params: { tipo_empresa: 'registradora' },
      });
      setCompanies(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  }, []);

  useEffect(() => {
    if (!initialized || !user || semAcesso) return;
    fetchEstadoInfo();
    fetchCredenciamentos();
    fetchPortarias();
    fetchCompanies();
  }, [initialized, user, semAcesso, fetchEstadoInfo, fetchCredenciamentos, fetchPortarias, fetchCompanies]);

  // ── Dados Gerais: ativar / editar / dar baixa / reativar estado ──
  const ativarEstado = async () => {
    setSalvandoEstado(true);
    try {
      await axios.post(`${API}/estados`, { estado_sigla: siglaUpper, observacoes }, { withCredentials: true });
      toast.success('Estado ativado para acompanhamento');
      fetchEstadoInfo();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao ativar estado');
    } finally {
      setSalvandoEstado(false);
    }
  };

  const salvarObservacoes = async () => {
    setSalvandoEstado(true);
    try {
      await axios.patch(`${API}/estados/${siglaUpper}`, { observacoes }, { withCredentials: true });
      toast.success('Observações salvas');
      fetchEstadoInfo();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao salvar observações');
    } finally {
      setSalvandoEstado(false);
    }
  };

  const darBaixaEstado = async () => {
    if (!window.confirm(`Dar baixa no acompanhamento do estado ${siglaUpper}? Portarias, credenciamentos e documentos vinculados continuam intactos.`)) return;
    try {
      await axios.delete(`${API}/estados/${siglaUpper}`, { withCredentials: true });
      toast.success('Estado removido do acompanhamento');
      fetchEstadoInfo();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao dar baixa no estado');
    }
  };

  const reativarEstado = async () => {
    try {
      await axios.post(`${API}/estados/${siglaUpper}/reativar`, {}, { withCredentials: true });
      toast.success('Estado reativado');
      fetchEstadoInfo();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao reativar estado');
    }
  };

  // ── Credenciamentos (empresa x estado) ──
  const abrirNovoCredenciamento = () => {
    setEditandoCredId(null);
    setCredForm(emptyCredForm());
    setCredDialogOpen(true);
  };

  const abrirEdicaoCredenciamento = (cred) => {
    setEditandoCredId(cred.credenciamento_id);
    setCredForm({
      company_id: cred.company_id,
      extrato_contrato: cred.extrato_contrato || '',
      status: cred.status || 'ativo',
      validade: cred.validade ? cred.validade.split('T')[0] : '',
      valor_total_registro: cred.valor_total_registro ?? '',
      valor_detran: cred.valor_detran ?? '',
      valor_registradora: cred.valor_registradora ?? '',
    });
    setCredDialogOpen(true);
  };

  const salvarCredenciamento = async (e) => {
    e.preventDefault();
    const payload = {
      extrato_contrato: credForm.extrato_contrato,
      status: credForm.status,
      validade: credForm.validade || null,
      valor_total_registro: credForm.valor_total_registro === '' ? null : Number(credForm.valor_total_registro),
      valor_detran: credForm.valor_detran === '' ? null : Number(credForm.valor_detran),
      valor_registradora: credForm.valor_registradora === '' ? null : Number(credForm.valor_registradora),
    };
    try {
      if (editandoCredId) {
        await axios.patch(`${API}/credenciamentos/${editandoCredId}`, payload, { withCredentials: true });
        toast.success('Credenciamento atualizado');
      } else {
        await axios.post(`${API}/estados/${siglaUpper}/credenciamentos`, { company_id: credForm.company_id, ...payload }, { withCredentials: true });
        toast.success('Credenciamento criado');
      }
      setCredDialogOpen(false);
      fetchCredenciamentos();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao salvar credenciamento');
    }
  };

  const darBaixaCredenciamento = async (cred) => {
    if (!window.confirm('Dar baixa neste credenciamento?')) return;
    try {
      await axios.delete(`${API}/credenciamentos/${cred.credenciamento_id}`, { withCredentials: true });
      toast.success('Credenciamento removido');
      fetchCredenciamentos();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao remover credenciamento');
    }
  };

  // ── Portarias do estado ──
  const resetPortariaForm = () => {
    setPortariaForm(emptyPortariaForm(siglaUpper));
    setAnexarArquivo(false);
    setArquivoPdf(null);
    setEmpresasSelecionadas([]);
  };

  const handlePromoverPortaria = (item, estadoSigla) => {
    const primeiroExcerto = (item.excerpts && item.excerpts[0]) || '';
    const textoLimpo = primeiroExcerto.replace(/<[^>]+>/g, '');
    setPortariaForm({
      title: '', content: textoLimpo, source: 'Querido Diário', detran: estadoSigla,
      date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
      numero: '', orgao_emissor: '', estado_sigla: estadoSigla, status: 'vigente',
      link_pdf: item.url || '', origem: 'querido_diario', querido_diario_url: item.url || '', summary: textoLimpo,
      tipo: '',
    });
    setAnexarArquivo(false);
    setArquivoPdf(null);
    setEmpresasSelecionadas([]);
    setPortariaDialogOpen(true);
    toast.info('Revise os dados e confirme o cadastro da portaria.');
  };

  const salvarPortaria = async (e) => {
    e.preventDefault();
    if (anexarArquivo && !arquivoPdf) {
      toast.error('Selecione o arquivo PDF ou desmarque "Anexar PDF"');
      return;
    }
    setSalvandoPortaria(true);
    try {
      if (anexarArquivo) {
        const fd = new FormData();
        Object.entries(portariaForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
        fd.append('source', portariaForm.source || 'Manual');
        if (empresasSelecionadas.length > 0) fd.append('empresas_referenciadas', JSON.stringify(empresasSelecionadas));
        fd.append('file', arquivoPdf);
        await axios.post(`${API}/portarias/upload`, fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await axios.post(`${API}/portarias`, { ...portariaForm, empresas_referenciadas: empresasSelecionadas }, { withCredentials: true });
      }
      toast.success('Portaria cadastrada');
      setPortariaDialogOpen(false);
      resetPortariaForm();
      fetchPortarias();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao cadastrar portaria');
    } finally {
      setSalvandoPortaria(false);
    }
  };

  const alternarStatusPortaria = async (portaria) => {
    const novoStatus = portaria.status === 'vigente' ? 'revogada' : 'vigente';
    try {
      await axios.patch(`${API}/portarias/${portaria.portaria_id}`, { status: novoStatus }, { withCredentials: true });
      toast.success(`Portaria marcada como ${novoStatus}`);
      fetchPortarias();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar portaria');
    }
  };

  const darBaixaPortaria = async (portaria) => {
    if (!window.confirm(`Dar baixa na portaria "${portaria.title}"?`)) return;
    try {
      await axios.delete(`${API}/portarias/${portaria.portaria_id}`, { withCredentials: true });
      toast.success('Portaria removida');
      fetchPortarias();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao remover portaria');
    }
  };

  const baixarPdfPortaria = async (portaria) => {
    if (!portaria.link_pdf) return;
    if (/^https?:\/\//.test(portaria.link_pdf)) {
      window.open(portaria.link_pdf, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const response = await axios.get(`${API}/portarias/${portaria.portaria_id}/pdf`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `portaria_${portaria.numero || portaria.portaria_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      toast.error('Erro ao baixar PDF da portaria');
    }
  };

  if (semAcesso) {
    return (
      <DashboardLayout>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Ban className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400">Seu perfil não tem acesso aos dados do estado {siglaUpper}.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (erro403) {
    return (
      <DashboardLayout>
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Ban className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400">Seu perfil não tem acesso aos dados do estado {siglaUpper}.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/estados')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Estado <span className="text-primary-400 font-mono">{siglaUpper}</span>
              {estadoInfo?.estado_nome && <span className="text-zinc-400 font-normal"> — {estadoInfo.estado_nome}</span>}
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              {estadoInfo?.total_empresas ?? 0} empresa(s) credenciada(s) · {estadoInfo?.total_portarias_vigentes ?? 0} portaria(s) vigente(s)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando...</span>
          </div>
        ) : (
          <Tabs defaultValue="dados-gerais">
            <TabsList>
              <TabsTrigger value="dados-gerais">Dados Gerais</TabsTrigger>
              <TabsTrigger value="portarias">Portarias</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
            </TabsList>

            {/* ═══ ABA: DADOS GERAIS ═══ */}
            <TabsContent value="dados-gerais" className="space-y-6 mt-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Acompanhamento do estado</span>
                    {estadoInfo?.configurado && (
                      <Badge className={estadoInfo?.estado?.deleted_at
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-green-500/10 text-green-400 border-green-500/20'}>
                        {estadoInfo?.estado?.deleted_at ? 'Baixa dada' : 'Ativo'}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!estadoInfo?.configurado ? (
                    <div className="text-center py-6">
                      <p className="text-zinc-400 mb-4">Este estado ainda não foi ativado para acompanhamento de credenciamento.</p>
                      <Button onClick={ativarEstado} disabled={salvandoEstado} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                        <Plus className="h-4 w-4" />
                        {salvandoEstado ? 'Ativando...' : `Ativar ${siglaUpper} para acompanhamento`}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-zinc-300">Observações</Label>
                        <Textarea
                          value={observacoes}
                          onChange={(e) => setObservacoes(e.target.value)}
                          className="bg-background border-border text-white mt-2"
                          disabled={!!estadoInfo?.estado?.deleted_at}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={salvarObservacoes} disabled={salvandoEstado || !!estadoInfo?.estado?.deleted_at} className="bg-primary-500 hover:bg-primary-600 text-white">
                          Salvar observações
                        </Button>
                        {estadoInfo?.estado?.deleted_at ? (
                          <Button onClick={reativarEstado} variant="outline" className="gap-2">
                            <RotateCcw className="h-4 w-4" />
                            Reativar estado
                          </Button>
                        ) : (
                          <Button onClick={darBaixaEstado} variant="outline" className="border-red-900/40 text-red-400 hover:bg-red-950/30 gap-2">
                            <Trash2 className="h-4 w-4" />
                            Dar baixa no estado
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Empresas credenciadas</span>
                    <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={abrirNovoCredenciamento} size="sm" className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                          <Plus className="h-4 w-4" />
                          Novo credenciamento
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border text-white">
                        <DialogHeader>
                          <DialogTitle>{editandoCredId ? 'Editar credenciamento' : 'Novo credenciamento'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={salvarCredenciamento} className="space-y-4 mt-2">
                          {!editandoCredId && (
                            <div>
                              <Label className="text-zinc-300">Empresa</Label>
                              <Select value={credForm.company_id} onValueChange={(v) => setCredForm((p) => ({ ...p, company_id: v }))}>
                                <SelectTrigger className="bg-background border-border text-white mt-2">
                                  <SelectValue placeholder="Selecione a empresa" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-white">
                                  {companies.map((c) => (
                                    <SelectItem key={c.company_id} value={c.company_id}>{c.nome_fantasia || c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div>
                            <Label className="text-zinc-300">Extrato do contrato</Label>
                            <Textarea
                              value={credForm.extrato_contrato}
                              onChange={(e) => setCredForm((p) => ({ ...p, extrato_contrato: e.target.value }))}
                              className="bg-background border-border text-white mt-2"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-zinc-300">Status</Label>
                              <Select value={credForm.status} onValueChange={(v) => setCredForm((p) => ({ ...p, status: v }))}>
                                <SelectTrigger className="bg-background border-border text-white mt-2">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-white">
                                  <SelectItem value="ativo">Ativo</SelectItem>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="sem_efeito">Sem efeito</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-zinc-300">Validade</Label>
                              <Input type="date" value={credForm.validade} onChange={(e) => setCredForm((p) => ({ ...p, validade: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-zinc-300 text-xs">Valor total</Label>
                              <Input type="number" step="0.01" value={credForm.valor_total_registro} onChange={(e) => setCredForm((p) => ({ ...p, valor_total_registro: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                            <div>
                              <Label className="text-zinc-300 text-xs">Valor DETRAN</Label>
                              <Input type="number" step="0.01" value={credForm.valor_detran} onChange={(e) => setCredForm((p) => ({ ...p, valor_detran: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                            <div>
                              <Label className="text-zinc-300 text-xs">Valor registradora</Label>
                              <Input type="number" step="0.01" value={credForm.valor_registradora} onChange={(e) => setCredForm((p) => ({ ...p, valor_registradora: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                          </div>
                          <Button type="submit" className="w-full bg-primary-500 hover:bg-primary-600 text-white">Salvar</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {credenciamentos.length === 0 ? (
                    <p className="text-zinc-500 text-sm py-4 text-center">Nenhum credenciamento cadastrado neste estado.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead className="text-zinc-400">Empresa</TableHead>
                          <TableHead className="text-zinc-400">Status</TableHead>
                          <TableHead className="text-zinc-400">Validade</TableHead>
                          <TableHead className="text-zinc-400 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {credenciamentos.map((cred) => {
                          const company = companies.find((c) => c.company_id === cred.company_id);
                          return (
                            <TableRow key={cred.credenciamento_id} className={`border-border ${cred.deleted_at ? 'opacity-50' : ''}`}>
                              <TableCell className="text-white">{company?.nome_fantasia || company?.name || cred.company_id}</TableCell>
                              <TableCell>
                                <Badge className="bg-zinc-800 text-zinc-300 border-input text-xs">{cred.status}</Badge>
                                {cred.deleted_at && <Badge className="ml-2 bg-red-500/10 text-red-400 border-red-500/20 text-xs">removido</Badge>}
                              </TableCell>
                              <TableCell className="text-zinc-400 text-sm">{cred.validade ? new Date(cred.validade).toLocaleDateString('pt-BR') : '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" title="Editar" onClick={() => abrirEdicaoCredenciamento(cred)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {!cred.deleted_at && (
                                    <Button variant="ghost" size="icon" title="Dar baixa" onClick={() => darBaixaCredenciamento(cred)}>
                                      <Trash2 className="h-4 w-4 text-red-400" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ ABA: PORTARIAS ═══ */}
            <TabsContent value="portarias" className="space-y-6 mt-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Portarias de {siglaUpper}</span>
                    <Dialog open={portariaDialogOpen} onOpenChange={(open) => { setPortariaDialogOpen(open); if (!open) resetPortariaForm(); }}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                          <Plus className="h-4 w-4" />
                          Nova portaria
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border text-white max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Cadastrar portaria — {siglaUpper}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={salvarPortaria} className="space-y-4 mt-2">
                          <div>
                            <Label className="text-zinc-300">Título</Label>
                            <Input value={portariaForm.title} onChange={(e) => setPortariaForm((p) => ({ ...p, title: e.target.value }))} className="bg-background border-border text-white mt-2" required />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-zinc-300">Número</Label>
                              <Input value={portariaForm.numero} onChange={(e) => setPortariaForm((p) => ({ ...p, numero: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                            <div>
                              <Label className="text-zinc-300">Órgão emissor</Label>
                              <Input value={portariaForm.orgao_emissor} onChange={(e) => setPortariaForm((p) => ({ ...p, orgao_emissor: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-zinc-300">Fonte</Label>
                              <Input value={portariaForm.source} onChange={(e) => setPortariaForm((p) => ({ ...p, source: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                            <div>
                              <Label className="text-zinc-300">Status</Label>
                              <Select value={portariaForm.status} onValueChange={(v) => setPortariaForm((p) => ({ ...p, status: v }))}>
                                <SelectTrigger className="bg-background border-border text-white mt-2">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-white">
                                  <SelectItem value="vigente">Vigente</SelectItem>
                                  <SelectItem value="revogada">Revogada</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-zinc-300">Data</Label>
                              <Input type="date" value={portariaForm.date} onChange={(e) => setPortariaForm((p) => ({ ...p, date: e.target.value }))} className="bg-background border-border text-white mt-2" />
                            </div>
                            <div>
                              <Label className="text-zinc-300">Tipo</Label>
                              <Select value={portariaForm.tipo} onValueChange={(v) => setPortariaForm((p) => ({ ...p, tipo: v }))}>
                                <SelectTrigger className="bg-background border-border text-white mt-2">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-white">
                                  {TIPOS_PORTARIA.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-zinc-300">Conteúdo</Label>
                            <Textarea value={portariaForm.content} onChange={(e) => setPortariaForm((p) => ({ ...p, content: e.target.value }))} className="bg-background border-border text-white mt-2 min-h-[100px]" />
                          </div>
                          <div>
                            <Label className="text-zinc-300">Empresa(s) credenciada(s) referenciada(s)</Label>
                            <div className="mt-2 bg-background border border-border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                              {companies.length === 0 ? (
                                <p className="text-xs text-zinc-500 px-1 py-1">Nenhuma empresa disponível</p>
                              ) : (
                                companies.map((c) => (
                                  <label key={c.company_id} className="flex items-center gap-2 px-1 py-1 text-sm text-zinc-300 hover:bg-zinc-800/50 rounded cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={empresasSelecionadas.includes(c.company_id)}
                                      onChange={() => toggleEmpresaReferenciada(c.company_id)}
                                      className="rounded border-input"
                                    />
                                    {c.nome_fantasia || c.name}
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="border-t border-border pt-4">
                            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer mb-3">
                              <Checkbox checked={anexarArquivo} onCheckedChange={(c) => setAnexarArquivo(!!c)} />
                              Anexar PDF (upload real)
                            </label>
                            {anexarArquivo ? (
                              <Input type="file" accept="application/pdf" onChange={(e) => setArquivoPdf(e.target.files?.[0] || null)} className="bg-background border-border text-white" />
                            ) : (
                              <div>
                                <Label className="text-zinc-300">Link do PDF (opcional)</Label>
                                <Input value={portariaForm.link_pdf} onChange={(e) => setPortariaForm((p) => ({ ...p, link_pdf: e.target.value }))} placeholder="https://..." className="bg-background border-border text-white mt-2" />
                              </div>
                            )}
                          </div>
                          <Button type="submit" disabled={salvandoPortaria} className="w-full bg-primary-500 hover:bg-primary-600 text-white">
                            {salvandoPortaria ? 'Cadastrando...' : 'Cadastrar'}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {portarias.length === 0 ? (
                    <p className="text-zinc-500 text-sm py-4 text-center">Nenhuma portaria cadastrada para {siglaUpper}.</p>
                  ) : (
                    <div className="space-y-2">
                      {portarias.map((portaria) => (
                        <div key={portaria.portaria_id} className={`flex items-center justify-between p-3 rounded-lg border border-border ${portaria.deleted_at ? 'opacity-50' : ''}`}>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {portaria.numero ? `${portaria.numero} — ` : ''}{portaria.title}
                            </p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <Badge className={portaria.status === 'revogada'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20 text-xs'
                                : 'bg-green-500/10 text-green-400 border-green-500/20 text-xs'}>
                                {portaria.status === 'revogada' ? 'Revogada' : 'Vigente'}
                              </Badge>
                              {portaria.tipo && (
                                <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                                  {TIPOS_PORTARIA.find((t) => t.value === portaria.tipo)?.label || portaria.tipo}
                                </Badge>
                              )}
                              {Array.isArray(portaria.empresas_referenciadas) && portaria.empresas_referenciadas.length > 0 && (
                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                                  {portaria.empresas_referenciadas.length} empresa(s) referenciada(s)
                                </Badge>
                              )}
                              <span className="text-xs text-zinc-500">{new Date(portaria.date).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {portaria.link_pdf && (
                              <Button variant="ghost" size="icon" title="Ver PDF" onClick={() => baixarPdfPortaria(portaria)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            {!portaria.deleted_at && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => alternarStatusPortaria(portaria)}>
                                  {portaria.status === 'vigente' ? 'Revogar' : 'Reativar'}
                                </Button>
                                <Button variant="ghost" size="icon" title="Dar baixa" onClick={() => darBaixaPortaria(portaria)}>
                                  <Trash2 className="h-4 w-4 text-red-400" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="border-t border-border pt-8">
                <QueridoDiarioBusca estadoFixo={siglaUpper} onPromover={handlePromoverPortaria} />
              </div>
            </TabsContent>

            {/* ═══ ABA: DOCUMENTOS ═══ */}
            <TabsContent value="documentos" className="mt-6">
              <DocumentosEstadoTab estadoFixo={siglaUpper} compact />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
