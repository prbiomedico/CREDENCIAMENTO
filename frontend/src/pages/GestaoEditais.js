import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, FileText, Paperclip, Trash2, Pencil, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

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

const GestaoEditais = () => {
  const { user, initialized } = useAuth();
  const [editais, setEditais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formData, setFormData] = useState(emptyFormData());
  const [novoDocumento, setNovoDocumento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [enviandoTermo, setEnviandoTermo] = useState(false);
  const [termoNome, setTermoNome] = useState('');

  useEffect(() => {
    if (!initialized || !user) return;
    fetchEditais();
  }, [initialized, user]);

  const fetchEditais = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/editais`, { withCredentials: true });
      setEditais(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Erro ao carregar editais:', error);
      toast.error('Erro ao carregar editais');
    } finally {
      setLoading(false);
    }
  };

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
      withCredentials: true,
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
        await axios.patch(`${API}/editais/${editandoId}`, formData, { withCredentials: true });
        toast.success('Edital atualizado com sucesso!');
      } else {
        await axios.post(`${API}/editais`, formData, { withCredentials: true });
        toast.success('Edital criado com sucesso!');
      }
      setDialogOpen(false);
      resetForm();
      fetchEditais();
    } catch (error) {
      console.error('Erro ao salvar edital:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao salvar edital');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Editais</h1>
            <p className="text-zinc-400 text-sm mt-1">Crie e edite editais — anexos e termo de adesão ficam disponíveis na Área de Transparência</p>
          </div>
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando editais...</span>
          </div>
        ) : editais.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-zinc-400 font-medium mb-1">Nenhum edital cadastrado</p>
              <Button onClick={abrirNovo} className="bg-primary-500 hover:bg-primary-600 text-white gap-2 mt-3">
                <Plus className="h-4 w-4" />
                Cadastrar Primeiro Edital
              </Button>
            </CardContent>
          </Card>
        ) : (
          // Mesma lógica de BentoGrid do Editais.js (Fase 4, PENDING_ACTIONS.md
          // item 39) — lista de cards uniformes o bastante (descrição
          // truncada em 2 linhas) pra ganhar em escaneabilidade lado a lado.
          <BentoGrid>
            {editais.map((edital) => (
              <BentoCard key={edital.edital_id} size="2x1" interactive className="bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold text-white mb-2">{edital.titulo}</CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">DETRAN-{edital.uf}</Badge>
                        <Badge className={edital.status === 'aberto'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20 text-xs'
                          : 'bg-zinc-700/50 text-zinc-300 border-zinc-600 text-xs'}>
                          {edital.status === 'aberto' ? 'Aberto' : 'Encerrado'}
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
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => abrirEdicao(edital)} title="Editar">
                      <Pencil className="h-4 w-4 text-zinc-400" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-zinc-400 line-clamp-2">{edital.descricao}</p>
                </CardContent>
              </BentoCard>
            ))}
          </BentoGrid>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GestaoEditais;
