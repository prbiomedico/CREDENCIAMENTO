import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Folder, Plus, Calendar, ChevronRight, Clock, CheckCircle, XCircle, Pencil, Paperclip, Trash2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const STATUS_EDITAL = {
  aberto: { label: 'Aberto', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  em_analise: { label: 'Em Análise', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Clock },
  encerrado: { label: 'Encerrado', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: XCircle },
};

const emptyFormData = () => ({
  titulo: '',
  descricao: '',
  uf: '',
  status: 'aberto',
  data_encerramento: '',
  documentos_obrigatorios: [],
  anexos: [],
  termo_adesao_path: '',
});

const Editais = () => {
  const { user, initialized, getToken } = useAuth();
  const navigate = useNavigate();

  // Mesmo padrão contextual que Portarias.js já usa: uma tela só, ações de
  // gestão (criar/editar edital) aparecem só pra quem pode gerenciar — em vez
  // de uma segunda tela (GestaoEditais.js, removida nesta fusão). Mesmos
  // perfis que já tinham acesso a POST/PATCH /editais no backend.
  const podeGerenciar = ['sigcr_admin', 'detran', 'detran_admin'].includes(user?.perfil);

  const [editais, setEditais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUF, setFiltroUF] = useState('todos');

  // ── Candidatura (consulta) ──
  const [editalParaCandidatar, setEditalParaCandidatar] = useState(null);
  const [empresasParaEscolher, setEmpresasParaEscolher] = useState([]);
  const [empresaEscolhida, setEmpresaEscolhida] = useState('');
  const [candidatando, setCandidatando] = useState(false);

  // ── Criar/editar edital (gestão) ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formData, setFormData] = useState(emptyFormData());
  const [novoDocumento, setNovoDocumento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [enviandoTermo, setEnviandoTermo] = useState(false);
  const [termoNome, setTermoNome] = useState('');

  useEffect(() => { if (!initialized || !user) return; fetchEditais(); }, [initialized, user]);

  const fetchEditais = async () => {
    try { await getToken(); } catch {}
    try {
      const res = await axios.get(`${API}/editais`);
      setEditais(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Erro ao carregar editais'); }
    finally { setLoading(false); }
  };

  const enviarCandidatura = async (edital, companyId) => {
    setCandidatando(true);
    try {
      await axios.post(`${API}/solicitacoes`, {
        edital_id: edital.edital_id,
        company_id: companyId,
        uf: edital.uf
      });
      toast.success('Candidatura realizada! Veja em Solicitações.');
      setEditalParaCandidatar(null);
      navigate('/solicitacoes');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao candidatar');
    } finally {
      setCandidatando(false);
    }
  };

  const handleCandidatar = async (edital) => {
    try {
      const companies = await axios.get(`${API}/companies`);
      const empresas = Array.isArray(companies.data) ? companies.data : [];
      if (!empresas.length) {
        toast.error('Cadastre uma empresa primeiro');
        navigate('/registradoras-empresa');
        return;
      }
      if (empresas.length === 1) {
        await enviarCandidatura(edital, empresas[0].company_id);
        return;
      }
      // Mais de uma empresa na conta (ex: registradora + financeira) — não dá
      // pra assumir qual delas está se candidatando, precisa escolher.
      setEmpresasParaEscolher(empresas);
      setEmpresaEscolhida('');
      setEditalParaCandidatar(edital);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao candidatar');
    }
  };

  // ── Gestão: criar/editar edital ──
  const resetForm = () => {
    setFormData(emptyFormData());
    setEditandoId(null);
    setNovoDocumento('');
    setTermoNome('');
  };

  const abrirNovo = () => {
    resetForm();
    setDialogOpen(true);
  };

  const abrirEdicao = (edital) => {
    setFormData({
      titulo: edital.titulo || '',
      descricao: edital.descricao || '',
      uf: edital.uf || '',
      status: edital.status || 'aberto',
      data_encerramento: edital.data_encerramento ? edital.data_encerramento.split('T')[0] : '',
      documentos_obrigatorios: Array.isArray(edital.documentos_obrigatorios) ? edital.documentos_obrigatorios : [],
      anexos: Array.isArray(edital.anexos) ? edital.anexos : [],
      termo_adesao_path: edital.termo_adesao_path || '',
    });
    setEditandoId(edital.edital_id);
    setTermoNome(edital.termo_adesao_path ? 'Termo de adesão já enviado' : '');
    setDialogOpen(true);
  };

  const adicionarDocumento = () => {
    if (!novoDocumento.trim()) return;
    setFormData((p) => ({ ...p, documentos_obrigatorios: [...p.documentos_obrigatorios, novoDocumento.trim()] }));
    setNovoDocumento('');
  };

  const removerDocumento = (idx) => {
    setFormData((p) => ({ ...p, documentos_obrigatorios: p.documentos_obrigatorios.filter((_, i) => i !== idx) }));
  };

  const uploadArquivo = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API}/editais/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data; // {nome, path}
  };

  const handleAnexoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoAnexo(true);
    try {
      const { nome, path } = await uploadArquivo(file);
      setFormData((p) => ({ ...p, anexos: [...p.anexos, { nome, path }] }));
      toast.success('Anexo enviado');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar anexo');
    } finally {
      setEnviandoAnexo(false);
      e.target.value = '';
    }
  };

  const removerAnexo = (idx) => {
    setFormData((p) => ({ ...p, anexos: p.anexos.filter((_, i) => i !== idx) }));
  };

  const handleTermoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoTermo(true);
    try {
      const { nome, path } = await uploadArquivo(file);
      setFormData((p) => ({ ...p, termo_adesao_path: path }));
      setTermoNome(nome);
      toast.success('Termo de adesão enviado');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar termo de adesão');
    } finally {
      setEnviandoTermo(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.titulo || !formData.uf) {
      toast.error('Preencha título e UF');
      return;
    }
    setSalvando(true);
    try {
      if (editandoId) {
        await axios.patch(`${API}/editais/${editandoId}`, formData);
        toast.success('Edital atualizado com sucesso!');
      } else {
        await axios.post(`${API}/editais`, formData);
        toast.success('Edital criado com sucesso!');
      }
      setDialogOpen(false);
      resetForm();
      fetchEditais();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao salvar edital');
    } finally {
      setSalvando(false);
    }
  };

  const editaisFiltrados = filtroUF === 'todos' ? editais : editais.filter(e => e.uf === filtroUF);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <Folder className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight">Editais</h1>
              <p className="text-zinc-500 text-sm">Processos de credenciamento abertos pelos DETRANs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filtroUF} onValueChange={setFiltroUF}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white w-36">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                <SelectItem value="todos">Todos</SelectItem>
                {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
            {podeGerenciar && (
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button onClick={abrirNovo} className="bg-primary-500 hover:bg-primary-600 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Novo Edital
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editandoId ? 'Editar Edital' : 'Cadastrar Novo Edital'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label className="text-zinc-300">Título</Label>
                      <Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-zinc-300">UF</Label>
                        <Select value={formData.uf} onValueChange={(value) => setFormData({ ...formData, uf: value })}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700 text-white max-h-64">
                            {UFS.map((uf) => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-zinc-300">Status</Label>
                        <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                            <SelectItem value="aberto">Aberto</SelectItem>
                            <SelectItem value="encerrado">Encerrado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-zinc-300">Data de Encerramento</Label>
                      <Input type="date" value={formData.data_encerramento} onChange={(e) => setFormData({ ...formData, data_encerramento: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Descrição</Label>
                      <Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1 min-h-[100px]" />
                    </div>

                    <div>
                      <Label className="text-zinc-300">Documentos Obrigatórios</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          value={novoDocumento}
                          onChange={(e) => setNovoDocumento(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarDocumento(); } }}
                          placeholder="Ex: Contrato Social"
                          className="bg-zinc-800 border-zinc-700 text-white"
                        />
                        <Button type="button" onClick={adicionarDocumento} variant="outline" className="border-zinc-700 text-zinc-300 shrink-0">
                          Adicionar
                        </Button>
                      </div>
                      {formData.documentos_obrigatorios.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {formData.documentos_obrigatorios.map((doc, idx) => (
                            <Badge key={idx} className="bg-zinc-800 text-zinc-300 border-zinc-700 gap-1 pr-1">
                              {doc}
                              <button type="button" onClick={() => removerDocumento(idx)} className="ml-1 hover:text-red-400">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-zinc-800 pt-4">
                      <Label className="text-zinc-300">Anexos (PDF)</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <Input type="file" accept="application/pdf" onChange={handleAnexoUpload} disabled={enviandoAnexo} className="bg-zinc-800 border-zinc-700 text-white" />
                        {enviandoAnexo && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
                      </div>
                      {formData.anexos.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {formData.anexos.map((a, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5">
                              <span className="flex items-center gap-1.5 text-zinc-300 truncate">
                                <Paperclip className="h-3 w-3 shrink-0" /> {a.nome}
                              </span>
                              <button type="button" onClick={() => removerAnexo(idx)} className="text-zinc-500 hover:text-red-400 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-zinc-300">Termo de Adesão (PDF)</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <Input type="file" accept="application/pdf" onChange={handleTermoUpload} disabled={enviandoTermo} className="bg-zinc-800 border-zinc-700 text-white" />
                        {enviandoTermo && <Loader2 className="h-4 w-4 animate-spin text-primary-400 shrink-0" />}
                      </div>
                      {termoNome && (
                        <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5">
                          <Paperclip className="h-3 w-3" /> {termoNome}
                        </p>
                      )}
                    </div>

                    <Button type="submit" disabled={salvando} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
                      {salvando ? 'Salvando...' : editandoId ? 'Salvar Alterações' : 'Cadastrar'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : editaisFiltrados.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Folder className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhum edital encontrado</p>
              {podeGerenciar ? (
                <Button onClick={abrirNovo} className="bg-primary-500 hover:bg-primary-600 text-white gap-2 mt-4">
                  <Plus className="h-4 w-4" />
                  Cadastrar Primeiro Edital
                </Button>
              ) : (
                <p className="text-sm text-zinc-600 mt-1">Aguarde editais dos DETRANs</p>
              )}
            </CardContent>
          </Card>
        ) : (
          // Lista de editais — BentoGrid, 2 cards por linha via size="2x1"
          // (Fase 4, PENDING_ACTIONS.md item 38): cards uniformes o bastante
          // (descrição já truncada em 2 linhas) pra ganhar em escaneabilidade
          // lado a lado em vez de empilhados. interactive=true porque cada
          // card tem uma ação real ("Candidatar-se" ou "Editar"), diferente
          // dos tiles de métrica do Dashboard, que são só leitura.
          <BentoGrid>
            {editaisFiltrados.map((edital) => {
              const cfg = STATUS_EDITAL[edital.status] || STATUS_EDITAL.encerrado;
              const Icon = cfg.icon;
              const dias = Math.ceil((new Date(edital.data_encerramento) - new Date()) / (1000*60*60*24));
              return (
                <BentoCard key={edital.edital_id} size="2x1" interactive className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="p-6 h-full flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">DETRAN-{edital.uf}</Badge>
                        <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                          <Icon className="h-3 w-3 mr-1" />{cfg.label}
                        </Badge>
                        {Array.isArray(edital.anexos) && edital.anexos.length > 0 && (
                          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 font-mono text-xs">
                            {edital.anexos.length} anexo(s)
                          </Badge>
                        )}
                        {edital.termo_adesao_path && (
                          <Badge className="bg-secondary-500/10 text-secondary-400 border-secondary-500/20 font-mono text-xs">
                            Termo de adesão
                          </Badge>
                        )}
                      </div>
                      {podeGerenciar && (
                        <button
                          type="button"
                          onClick={() => abrirEdicao(edital)}
                          title="Editar"
                          className="text-zinc-500 hover:text-white shrink-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">{edital.titulo}</h3>
                    <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{edital.descricao}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Encerra {new Date(edital.data_encerramento).toLocaleDateString('pt-BR')}</span>
                      {edital.status === 'aberto' && dias > 0 && (
                        <span className={`font-mono font-semibold ${dias <= 7 ? 'text-red-400' : dias <= 15 ? 'text-primary-400' : 'text-zinc-400'}`}>{dias} dias restantes</span>
                      )}
                    </div>
                    {/* "Candidatar-se" só faz sentido pra quem tem empresa própria — quem
                        gerencia editais (DETRAN/admin) usa "Editar" acima no lugar. */}
                    {!podeGerenciar && edital.status === 'aberto' && (
                      <Button onClick={() => handleCandidatar(edital)} className="bg-primary-500 hover:bg-primary-600 text-white text-sm h-9 px-4 mt-auto self-start">
                        Candidatar-se <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </CardContent>
                </BentoCard>
              );
            })}
          </BentoGrid>
        )}

        <Dialog open={!!editalParaCandidatar} onOpenChange={(open) => { if (!open) setEditalParaCandidatar(null); }}>
          <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
            <DialogHeader>
              <DialogTitle>Qual empresa está se candidatando?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-zinc-400">
              Sua conta tem mais de uma empresa cadastrada. Selecione qual delas está se candidatando ao edital{editalParaCandidatar ? ` "${editalParaCandidatar.titulo}"` : ''}.
            </p>
            <Select value={empresaEscolhida} onValueChange={setEmpresaEscolhida}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                {empresasParaEscolher.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_id}>
                    {c.nome_fantasia || c.name || c.company_id}
                    {c.tipo_empresa ? ` (${c.tipo_empresa})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                disabled={!empresaEscolhida || candidatando}
                onClick={() => enviarCandidatura(editalParaCandidatar, empresaEscolhida)}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Confirmar candidatura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Editais;
