import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, History, Pencil, Ban, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const CATEGORIAS = {
  pedido_credenciamento: { label: 'Pedido de Credenciamento', interna: false },
  espelho_homologacao: { label: 'Espelho de Homologação', interna: false },
  societario_juridico: { label: 'Societário/Jurídico', interna: true },
  estado_detran: { label: 'Estado/DETRAN', interna: false },
  atividade_raci: { label: 'Atividade RACI', interna: true },
};

const emptyForm = (estadoFixo) => ({
  categoria: '',
  tipo: '',
  nome: '',
  estado_sigla: estadoFixo || '',
  atividade_raci_numero: '',
  notes: '',
  file: null,
});

/**
 * Lista + upload + histórico/edição/soft-delete de documentos GOV-CRD-001.
 * Extraído de DocumentosGov.js para ser reaproveitado dentro da aba
 * "Documentos" da página Estado > UF (com estado_sigla travado) e na tela
 * genérica /credenciamento/documentos (sem estadoFixo, comportamento idêntico
 * ao de antes da extração).
 *
 * - estadoFixo: sigla (ex. "SP") — quando presente, trava estado_sigla nos
 *   filtros e no upload (esconde o campo de UF, já que o contexto da página
 *   já deixa isso implícito).
 * - compact: quando true, esconde o título/subtítulo grandes de página (usado
 *   dentro da aba, que já está dentro de um cabeçalho próprio do estado).
 */
const DocumentosEstadoTab = ({ estadoFixo, compact = false }) => {
  const { user, initialized } = useAuth();
  const isAdmin = user?.roles?.includes('sigcr_admin');
  const isDetranAdmin = user?.roles?.includes('detran_admin');
  const podeEscrever = isAdmin || isDetranAdmin;

  // categorias visíveis para o perfil atual (backend é a autoridade final)
  const categoriasVisiveis = isAdmin
    ? Object.keys(CATEGORIAS)
    : Object.keys(CATEGORIAS).filter((c) => !CATEGORIAS[c].interna);

  const [documentos, setDocumentos] = useState([]);
  const [tiposSugeridos, setTiposSugeridos] = useState({});
  const [atividadesRaci, setAtividadesRaci] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [versoesDialog, setVersoesDialog] = useState({ open: false, documento_id: null, itens: [] });
  const [editDialog, setEditDialog] = useState({ open: false, doc: null, nome: '', tipo: '', notes: '', vencimento: '' });
  const [form, setForm] = useState(emptyForm(estadoFixo));

  const [filtros, setFiltros] = useState({
    categoria: '',
    tipo: '',
    estado_sigla: estadoFixo || '',
    atividade_raci_numero: '',
    incluir_removidos: false,
  });

  const fetchDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtros.categoria) params.categoria = filtros.categoria;
      if (filtros.tipo) params.tipo = filtros.tipo;
      if (filtros.estado_sigla) params.estado_sigla = filtros.estado_sigla;
      if (filtros.atividade_raci_numero) params.atividade_raci_numero = filtros.atividade_raci_numero;
      if (filtros.incluir_removidos) params.incluir_removidos = true;

      const response = await axios.get(`${API}/documentos`, { withCredentials: true, params });
      setDocumentos(Array.isArray(response.data) ? response.data : []);
      setAcessoNegado(false);
    } catch (error) {
      if (error?.response?.status === 403) {
        setAcessoNegado(true);
      } else {
        console.error('Error fetching documentos:', error);
        toast.error('Erro ao carregar documentos');
      }
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    if (!initialized || !user) return;
    fetchDocumentos();
  }, [initialized, user, fetchDocumentos]);

  useEffect(() => {
    if (!initialized || !user || !podeEscrever) return;
    axios.get(`${API}/documentos/tipos-sugeridos`, { withCredentials: true })
      .then((res) => setTiposSugeridos(res.data))
      .catch(() => {});
    axios.get(`${API}/atividades-raci`, { withCredentials: true })
      .then((res) => setAtividadesRaci(Array.isArray(res.data?.atividades) ? res.data.atividades : []))
      .catch(() => {});
  }, [initialized, user, podeEscrever]);

  const resetForm = () => setForm(emptyForm(estadoFixo));

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!form.categoria || !form.tipo || !form.nome || !form.file) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    if (form.categoria === 'estado_detran' && !form.estado_sigla) {
      toast.error('UF é obrigatória para a categoria Estado/DETRAN');
      return;
    }
    if (form.categoria === 'atividade_raci' && !form.atividade_raci_numero) {
      toast.error('Selecione a atividade RACI vinculada');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('categoria', form.categoria);
      formData.append('tipo', form.tipo);
      formData.append('nome', form.nome);
      if (form.estado_sigla) formData.append('estado_sigla', form.estado_sigla);
      if (form.atividade_raci_numero) formData.append('atividade_raci_numero', form.atividade_raci_numero);
      if (form.notes) formData.append('notes', form.notes);
      formData.append('file', form.file);

      await axios.post(`${API}/documentos/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Documento enviado com sucesso!');
      setDialogOpen(false);
      resetForm();
      fetchDocumentos();
    } catch (error) {
      console.error('Error uploading documento:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documento_id, file_name) => {
    try {
      const response = await axios.get(`${API}/documentos/${documento_id}/download`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file_name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Error downloading documento:', error);
      toast.error('Erro ao baixar documento');
    }
  };

  const abrirVersoes = async (documento_id) => {
    try {
      const response = await axios.get(`${API}/documentos/${documento_id}/versoes`, { withCredentials: true });
      setVersoesDialog({ open: true, documento_id, itens: response.data });
    } catch (error) {
      console.error('Error fetching versoes:', error);
      toast.error('Erro ao carregar histórico de versões');
    }
  };

  const abrirEdicao = (doc) => {
    setEditDialog({ open: true, doc, nome: doc.nome, tipo: doc.tipo, notes: doc.notes || '', vencimento: doc.vencimento || '' });
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API}/documentos/${editDialog.doc.documento_id}`, {
        nome: editDialog.nome,
        tipo: editDialog.tipo,
        notes: editDialog.notes,
        vencimento: editDialog.vencimento || null,
      }, { withCredentials: true });
      toast.success('Documento atualizado');
      setEditDialog({ open: false, doc: null, nome: '', tipo: '', notes: '', vencimento: '' });
      fetchDocumentos();
    } catch (error) {
      console.error('Error updating documento:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar documento');
    }
  };

  const getVencimentoStatus = (vencimento) => {
    if (!vencimento) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVenc = new Date(vencimento);
    const diffDias = Math.round((dataVenc - hoje) / (1000 * 60 * 60 * 24));
    if (diffDias < 0) return { label: 'Vencido', className: 'bg-red-500/10 text-red-400 border-red-500/20' };
    if (diffDias <= 30) return { label: `Vence em ${diffDias}d`, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    return { label: 'Válido', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
  };

  const handleRemover = async (doc) => {
    if (!window.confirm(`Remover o documento "${doc.nome}"? Ele deixará de aparecer na listagem padrão.`)) return;
    try {
      await axios.delete(`${API}/documentos/${doc.documento_id}`, { withCredentials: true });
      toast.success('Documento removido');
      fetchDocumentos();
    } catch (error) {
      console.error('Error removing documento:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao remover documento');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const categoriaBadge = (categoria) => (
    <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 font-mono text-xs px-2 py-0.5">
      {CATEGORIAS[categoria]?.label || categoria}
    </Badge>
  );

  if (acessoNegado) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-12 text-center">
          <Ban className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-400">Seu perfil não tem acesso ao dossiê de credenciamento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="documentos-gov-page">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        {!compact && (
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Dossiê de Credenciamento</h1>
            <p className="text-zinc-400">Documentos GOV-CRD-001 vinculados ao credenciamento da HD Registros</p>
          </div>
        )}
        {podeEscrever && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="upload-documento-gov-btn" className="bg-primary-500 hover:bg-primary-600 text-white button-shadow">
                <Upload className="h-5 w-5 mr-2" />
                Enviar Documento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">Enviar Documento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4 mt-4">
                <div>
                  <Label className="text-zinc-300">Categoria</Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(value) => setForm((prev) => ({
                      ...prev,
                      categoria: value,
                      tipo: '',
                      estado_sigla: estadoFixo || ((value === 'estado_detran' && isDetranAdmin && !isAdmin) ? (user?.detran_uf || '') : ''),
                      atividade_raci_numero: '',
                    }))}
                  >
                    <SelectTrigger data-testid="categoria-select" className="bg-zinc-950 border-zinc-800 text-white mt-2">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                      {categoriasVisiveis.map((c) => (
                        <SelectItem key={c} value={c}>{CATEGORIAS[c].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {estadoFixo ? (
                  <div>
                    <Label className="text-zinc-300">UF</Label>
                    <div className="mt-2 px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm">
                      {estadoFixo} (travado nesta página de estado)
                    </div>
                  </div>
                ) : form.categoria === 'estado_detran' && (
                  <div>
                    <Label htmlFor="estado_sigla" className="text-zinc-300">UF</Label>
                    <Input
                      id="estado_sigla"
                      value={form.estado_sigla}
                      onChange={(e) => setForm((prev) => ({ ...prev, estado_sigla: e.target.value.toUpperCase().slice(0, 2) }))}
                      placeholder="Ex: SP"
                      maxLength={2}
                      disabled={isDetranAdmin && !isAdmin}
                      className="bg-zinc-950 border-zinc-800 focus:border-primary-500 text-white mt-2 disabled:opacity-70"
                      required
                    />
                  </div>
                )}

                {form.categoria === 'atividade_raci' && (
                  <div>
                    <Label className="text-zinc-300">Atividade RACI</Label>
                    <Select
                      value={form.atividade_raci_numero}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, atividade_raci_numero: value }))}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-2">
                        <SelectValue placeholder="Selecione a atividade" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        {atividadesRaci.map((a) => (
                          <SelectItem key={a.numero} value={String(a.numero)}>
                            {a.numero}. {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="tipo" className="text-zinc-300">Tipo</Label>
                  <Input
                    id="tipo"
                    list="tipos-sugeridos-list"
                    value={form.tipo}
                    onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                    placeholder="Ex: Contrato Social"
                    className="bg-zinc-950 border-zinc-800 focus:border-primary-500 text-white mt-2"
                    required
                  />
                  <datalist id="tipos-sugeridos-list">
                    {(tiposSugeridos[form.categoria] || []).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <Label htmlFor="nome" className="text-zinc-300">Nome do Documento</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex: Contrato Social - 2ª Alteração"
                    className="bg-zinc-950 border-zinc-800 focus:border-primary-500 text-white mt-2"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="notes" className="text-zinc-300">Observações (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary-500 text-white mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="file" className="text-zinc-300">Arquivo</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                    className="bg-zinc-950 border-zinc-800 focus:border-primary-500 text-white mt-2"
                    required
                  />
                  <p className="text-xs text-zinc-500 mt-1">Máx. 20MB. Tipos aceitos variam por categoria.</p>
                </div>

                <Button
                  type="submit"
                  disabled={uploading}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white button-shadow"
                >
                  {uploading ? 'Enviando...' : 'Enviar Documento'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filtros */}
      <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-zinc-300 mb-2 block">Categoria</Label>
            <Select
              value={filtros.categoria || 'todas'}
              onValueChange={(value) => setFiltros((prev) => ({ ...prev, categoria: value === 'todas' ? '' : value }))}
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                <SelectItem value="todas">Todas</SelectItem>
                {categoriasVisiveis.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORIAS[c].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-zinc-300 mb-2 block">Tipo</Label>
            <Input
              value={filtros.tipo}
              onChange={(e) => setFiltros((prev) => ({ ...prev, tipo: e.target.value }))}
              placeholder="Buscar por tipo..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </div>

          {!estadoFixo && isAdmin && (
            <div>
              <Label className="text-zinc-300 mb-2 block">UF</Label>
              <Input
                value={filtros.estado_sigla}
                onChange={(e) => setFiltros((prev) => ({ ...prev, estado_sigla: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="Ex: SP"
                maxLength={2}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          )}

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <Checkbox
                checked={filtros.incluir_removidos}
                onCheckedChange={(checked) => setFiltros((prev) => ({ ...prev, incluir_removidos: !!checked }))}
              />
              Incluir removidos
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-zinc-400">Carregando documentos...</p>
            </div>
          ) : documentos.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                    <TableHead className="text-zinc-400">Categoria</TableHead>
                    <TableHead className="text-zinc-400">Tipo</TableHead>
                    <TableHead className="text-zinc-400">Nome</TableHead>
                    <TableHead className="text-zinc-400">UF/RACI</TableHead>
                    <TableHead className="text-zinc-400">Vencimento</TableHead>
                    <TableHead className="text-zinc-400">Versão</TableHead>
                    <TableHead className="text-zinc-400">Tamanho</TableHead>
                    <TableHead className="text-zinc-400">Enviado por</TableHead>
                    <TableHead className="text-zinc-400 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentos.map((doc) => (
                    <TableRow key={doc.documento_id} className={`border-zinc-800 hover:bg-zinc-900/50 ${doc.deleted_at ? 'opacity-50' : ''}`}>
                      <TableCell>{categoriaBadge(doc.categoria)}</TableCell>
                      <TableCell className="text-zinc-300">{doc.tipo}</TableCell>
                      <TableCell className="text-white font-medium">
                        {doc.nome}
                        {doc.deleted_at && <Badge className="ml-2 bg-red-500/10 text-red-400 border-red-500/20 text-xs">removido</Badge>}
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {doc.estado_sigla || (doc.atividade_raci_numero ? `RACI #${doc.atividade_raci_numero}` : '—')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.vencimento ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400">{new Date(doc.vencimento).toLocaleDateString('pt-BR')}</span>
                            {getVencimentoStatus(doc.vencimento) && (
                              <Badge className={`${getVencimentoStatus(doc.vencimento).className} text-[10px] px-1.5 py-0`}>
                                {getVencimentoStatus(doc.vencimento).label}
                              </Badge>
                            )}
                            {doc.vencimento_fonte === 'ocr' && <Sparkles className="h-3 w-3 text-blue-400" title="Sugerido por OCR" />}
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">v{doc.versao}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">{doc.uploaded_by_nome}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Baixar" onClick={() => handleDownload(doc.documento_id, doc.file_name)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Histórico de versões" onClick={() => abrirVersoes(doc.documento_id)}>
                            <History className="h-4 w-4" />
                          </Button>
                          {podeEscrever && !doc.deleted_at && (
                            <>
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => abrirEdicao(doc)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Remover" onClick={() => handleRemover(doc)}>
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: histórico de versões */}
      <Dialog open={versoesDialog.open} onOpenChange={(open) => setVersoesDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Histórico de Versões</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {versoesDialog.itens.map((v) => (
              <div key={v.documento_id} className={`flex items-center justify-between p-3 rounded-lg border ${v.documento_id === versoesDialog.documento_id ? 'border-primary-500/40 bg-primary-500/5' : 'border-zinc-800'}`}>
                <div>
                  <p className="text-sm font-medium">v{v.versao} — {v.nome}</p>
                  <p className="text-xs text-zinc-500">{new Date(v.created_at).toLocaleString('pt-BR')} · {v.uploaded_by_nome}</p>
                </div>
                <Button variant="ghost" size="icon" title="Baixar" onClick={() => handleDownload(v.documento_id, v.file_name)}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: edição */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Editar Documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarEdicao} className="space-y-4 mt-2">
            <div>
              <Label className="text-zinc-300">Nome</Label>
              <Input
                value={editDialog.nome}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, nome: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-2"
                required
              />
            </div>
            <div>
              <Label className="text-zinc-300">Tipo</Label>
              <Input
                value={editDialog.tipo}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, tipo: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-2"
                required
              />
            </div>
            <div>
              <Label className="text-zinc-300">Observações</Label>
              <Textarea
                value={editDialog.notes}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, notes: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-2"
              />
            </div>
            <div>
              <Label className="text-zinc-300 flex items-center gap-1.5">
                Vencimento
                {editDialog.doc?.vencimento_fonte === 'ocr' && (
                  <span className="text-xs text-blue-400 flex items-center gap-1"><Sparkles className="h-3 w-3" /> sugerido por OCR</span>
                )}
              </Label>
              <Input
                type="date"
                value={editDialog.vencimento}
                onChange={(e) => setEditDialog((prev) => ({ ...prev, vencimento: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-2"
              />
            </div>
            <Button type="submit" className="w-full bg-primary-500 hover:bg-primary-600 text-white button-shadow">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentosEstadoTab;
