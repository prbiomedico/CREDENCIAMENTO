import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle, Clock, XCircle, Upload, FileText, Download, Trash2, Sparkles, Pencil,
  Check, X as XIcon, Folder, Search, List, LayoutGrid, Image as ImageIcon, File as FileIcon,
  MoreVertical, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_CFG = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  enviado: { label: 'Enviado', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  aprovado: { label: 'Aprovado', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  rejeitado: { label: 'Rejeitado', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

// Tipo de documento derivado do nome do item do checklist — o backend guarda
// document_type como texto livre (hoje sempre 'outros' nos uploads feitos por
// aqui), então classificar pelo nome é o único jeito de ter uma categoria real
// pra filtrar sem exigir que o usuário escolha um tipo manualmente toda vez.
const TIPO_LABELS = {
  certidao: 'Certidão', declaracao: 'Declaração', certificacao: 'Certificação',
  comprovacao: 'Comprovação', atestado: 'Atestado', laudo: 'Laudo',
  financeiro: 'Financeiro', termo: 'Termo', requerimento: 'Requerimento',
  societario: 'Societário', outros: 'Outros',
};

const inferirTipo = (nome) => {
  const n = (nome || '').toLowerCase();
  if (n.includes('certidão') || n.includes('certidões') || n.includes('cndt')) return 'certidao';
  if (n.includes('declaração') || n.includes('aceite')) return 'declaracao';
  if (n.includes('certificação')) return 'certificacao';
  if (n.includes('comprovação') || n.includes('comprovante')) return 'comprovacao';
  if (n.includes('atestado')) return 'atestado';
  if (n.includes('laudo')) return 'laudo';
  if (n.includes('balanço') || n.includes('patrimônio') || n.includes('patrimonial')) return 'financeiro';
  if (n.includes('termo')) return 'termo';
  if (n.includes('requerimento')) return 'requerimento';
  if (n.includes('ato constitutivo') || n.includes('inscrição')) return 'societario';
  return 'outros';
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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

const EXTENSOES_PREVIEW = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
const extensaoDe = (fileName) => (fileName || '').split('.').pop()?.toLowerCase() || '';
const IconeArquivo = (fileName) => {
  const ext = extensaoDe(fileName);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return ImageIcon;
  if (ext === 'pdf') return FileText;
  return FileIcon;
};

const ChecklistContran = ({ companyId }) => {
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [itemUpload, setItemUpload] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [deletando, setDeletando] = useState(null);
  const [editandoVencimento, setEditandoVencimento] = useState(null);
  const [vencimentoInput, setVencimentoInput] = useState('');

  // ── Gerenciador de arquivos: pastas por bloco, filtro por tipo, busca, lista/grade ──
  const [blocoAtivo, setBlocoAtivo] = useState(null); // número do bloco ou null = todos
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [previews, setPreviews] = useState({}); // document_id -> object URL
  const [menuAberto, setMenuAberto] = useState(null); // document_id do menu de ações aberto (grade)

  const fetchChecklist = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/checklist-contran`, {
        params: { company_id: companyId },
        withCredentials: true,
      });
      setChecklist(res.data);
    } catch (error) {
      console.error('Error fetching checklist CONTRAN:', error);
      toast.error('Erro ao carregar checklist CONTRAN 807');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  // Revoga os object URLs de preview ao desmontar — evita vazamento de memória.
  useEffect(() => () => { Object.values(previews).forEach((p) => URL.revokeObjectURL(p.url)); }, [previews]);

  const abrirUpload = (item) => {
    setItemUpload(item);
    setArquivo(null);
  };

  const enviarDocumento = async (e) => {
    e.preventDefault();
    if (!arquivo || !itemUpload) return;
    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('company_id', companyId);
      formData.append('document_type', inferirTipo(itemUpload.nome));
      formData.append('document_name', itemUpload.nome);
      formData.append('checklist_item_id', itemUpload.item_id);
      formData.append('file', arquivo);
      await axios.post(`${API}/documents/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Documento enviado — aguardando aprovação');
      setItemUpload(null);
      fetchChecklist();
    } catch (error) {
      console.error('Error uploading checklist document:', error);
      toast.error('Erro ao enviar documento');
    } finally {
      setEnviando(false);
    }
  };

  const handleDownload = async (documentId, fileName) => {
    try {
      const response = await axios.get(`${API}/documents/download/${documentId}`, {
        withCredentials: true,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Erro ao baixar documento');
    }
  };

  const handleDelete = async (documentId) => {
    if (deletando !== documentId) { setDeletando(documentId); return; }
    try {
      await axios.delete(`${API}/documents/${documentId}`, { withCredentials: true });
      toast.success('Documento removido');
      setDeletando(null);
      fetchChecklist();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Erro ao remover documento');
    }
  };

  const abrirEdicaoVencimento = (doc) => {
    setEditandoVencimento(doc.document_id);
    setVencimentoInput(doc.vencimento || '');
  };

  const salvarVencimento = async (documentId) => {
    try {
      await axios.patch(`${API}/documents/${documentId}/vencimento`, {
        vencimento: vencimentoInput || null,
      }, { withCredentials: true });
      toast.success('Vencimento atualizado');
      setEditandoVencimento(null);
      fetchChecklist();
    } catch (error) {
      console.error('Error updating vencimento:', error);
      toast.error('Erro ao atualizar vencimento');
    }
  };

  const MIME_POR_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

  const carregarPreview = useCallback(async (doc) => {
    if (!doc || previews[doc.document_id]) return;
    const ext = extensaoDe(doc.file_name);
    if (!EXTENSOES_PREVIEW.includes(ext)) return;
    try {
      const res = await axios.get(`${API}/documents/download/${doc.document_id}`, {
        withCredentials: true, responseType: 'blob',
      });
      // O backend serve download como application/octet-stream (força "salvar
      // como" com o nome certo) — pra exibir inline num <iframe>/<img> aqui,
      // o Blob precisa do MIME type real, senão o navegador não renderiza.
      const blobTipado = new Blob([res.data], { type: MIME_POR_EXT[ext] || res.data.type });
      const url = URL.createObjectURL(blobTipado);
      setPreviews((p) => ({ ...p, [doc.document_id]: { url, ext } }));
    } catch {
      // Preview é cosmético — falha aqui não impede baixar/gerenciar o documento.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews]);

  // ── Dados derivados: itens "achatados" (todo item de todo bloco, com o bloco anexado) ──
  const todosItens = useMemo(() => {
    if (!checklist) return [];
    return checklist.blocos.flatMap((bloco) =>
      bloco.itens.map((item) => ({ ...item, bloco: { numero: bloco.numero, nome: bloco.nome }, tipo: inferirTipo(item.nome) }))
    );
  }, [checklist]);

  const itensFiltrados = useMemo(() => {
    return todosItens.filter((item) => {
      if (blocoAtivo !== null && item.bloco.numero !== blocoAtivo) return false;
      if (tipoFiltro !== 'todos' && item.tipo !== tipoFiltro) return false;
      if (busca.trim() && !item.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
      return true;
    });
  }, [todosItens, blocoAtivo, tipoFiltro, busca]);

  // Carrega previews sob demanda ao entrar na visão em grade.
  useEffect(() => {
    if (viewMode !== 'grid') return;
    itensFiltrados.forEach((item) => { if (item.documento) carregarPreview(item.documento); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, itensFiltrados]);

  if (!companyId) return null;

  if (loading && !checklist) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto mb-4" />
        <p className="text-zinc-400">Carregando checklist...</p>
      </div>
    );
  }

  if (!checklist) return null;

  const { resumo, blocos } = checklist;
  const pctGeral = resumo.total > 0 ? Math.round((resumo.aprovados / resumo.total) * 100) : 0;

  if (blocos.length === 0) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-12 text-center">
          <p className="text-zinc-400 mb-2">Checklist ainda não definido para este tipo de empresa</p>
          <p className="text-sm text-zinc-500">A lista de documentos exigidos será publicada em breve.</p>
        </CardContent>
      </Card>
    );
  }

  const AcoesDocumento = ({ item, compact }) => {
    const doc = item.documento;
    if (!doc) {
      return (item.status === 'pendente' || item.status === 'rejeitado') ? (
        <Button size="sm" variant="ghost" onClick={() => abrirUpload(item)}
          className={compact ? 'h-7 w-7 p-0 text-primary-500 hover:text-primary-400 hover:bg-primary-500/10' : 'h-7 text-primary-500 hover:text-primary-400 hover:bg-primary-500/10'}>
          <Upload className="h-3.5 w-3.5" />{!compact && <span className="ml-1">Enviar</span>}
        </Button>
      ) : null;
    }
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => handleDownload(doc.document_id, doc.file_name)}
          className="h-7 w-7 p-0 text-primary-500 hover:text-primary-400 hover:bg-primary-500/10">
          <Download className="h-3.5 w-3.5" />
        </Button>
        {deletando === doc.document_id ? (
          <Button size="sm" variant="destructive-ghost" onClick={() => handleDelete(doc.document_id)}
            className="px-2">Confirmar</Button>
        ) : (
          <Button size="sm" variant="destructive-ghost" onClick={() => handleDelete(doc.document_id)}
            className="h-7 w-7 p-0">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="checklist-contran">
      {/* Progresso geral */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-heading font-semibold text-white">Progresso geral</h3>
              <p className="text-xs text-zinc-500">
                {resumo.aprovados} de {resumo.total} itens aprovados
                {resumo.enviados > 0 && ` · ${resumo.enviados} aguardando aprovação`}
                {resumo.rejeitados > 0 && ` · ${resumo.rejeitados} rejeitado(s)`}
              </p>
            </div>
            <span className="text-2xl font-heading font-bold text-primary-400">{pctGeral}%</span>
          </div>
          <Progress value={pctGeral} className="h-2" />
        </CardContent>
      </Card>

      {/* Cards de pasta — um por bloco do checklist */}
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-3">Pastas</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {blocos.map((bloco) => {
            const enviados = bloco.itens.filter((i) => i.documento).length;
            const tamanhoTotal = bloco.itens.reduce((acc, i) => acc + (i.documento?.file_size || 0), 0);
            const ativo = blocoAtivo === bloco.numero;
            return (
              <button
                key={bloco.numero}
                data-testid={`checklist-pasta-${bloco.numero}`}
                onClick={() => setBlocoAtivo(ativo ? null : bloco.numero)}
                className={`text-left p-3.5 rounded-xl border transition-colors ${
                  ativo ? 'bg-primary-500/10 border-primary-500/40' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <Folder className={`h-5 w-5 mb-2 ${ativo ? 'text-primary-400' : 'text-zinc-500'}`} />
                <p className={`text-xs font-semibold leading-snug mb-1 line-clamp-2 ${ativo ? 'text-primary-200' : 'text-zinc-200'}`}>
                  Bloco {bloco.numero} — {bloco.nome}
                </p>
                <p className="text-[11px] text-zinc-500">{enviados} de {bloco.itens.length} enviados</p>
                <p className="text-[11px] text-zinc-600 font-mono">{formatFileSize(tamanhoTotal)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              data-testid="checklist-busca"
              className="pl-8 h-9 bg-zinc-900/50 border-zinc-800 text-white text-sm"
            />
          </div>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="h-9 w-44 bg-zinc-900/50 border-zinc-800 text-white text-sm" data-testid="checklist-filtro-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {Object.entries(TIPO_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {blocoAtivo !== null && (
            <Button variant="ghost" size="sm" onClick={() => setBlocoAtivo(null)} className="h-9 text-xs text-zinc-400 hover:text-white">
              <XIcon className="h-3.5 w-3.5 mr-1" /> Limpar filtro de pasta
            </Button>
          )}
        </div>
        <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v)} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-0.5 self-start">
          <ToggleGroupItem value="list" data-testid="checklist-view-list" className="h-8 px-2.5 data-[state=on]:bg-primary-500/15 data-[state=on]:text-primary-400">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" data-testid="checklist-view-grid" className="h-8 px-2.5 data-[state=on]:bg-primary-500/15 data-[state=on]:text-primary-400">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {itensFiltrados.length === 0 ? (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-10 text-center text-sm text-zinc-500">Nenhum item encontrado com esses filtros.</CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* ── Visão em lista ── */
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 text-xs uppercase font-mono">Nome</TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase font-mono">Tipo</TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase font-mono">Tamanho</TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase font-mono">Modificado</TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase font-mono">Status</TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase font-mono text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensFiltrados.map((item) => {
                const cfg = STATUS_CFG[item.status] || STATUS_CFG.pendente;
                const doc = item.documento;
                const vencStatus = doc ? getVencimentoStatus(doc.vencimento) : null;
                const Icone = doc ? IconeArquivo(doc.file_name) : FileIcon;
                return (
                  <TableRow key={item.item_id} data-testid={`checklist-item-${item.item_id}`} className="border-zinc-800/80 hover:bg-zinc-800/30">
                    <TableCell className="max-w-[280px]">
                      <div className="flex items-start gap-2.5">
                        <Icone className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-200 font-medium truncate">{item.nome}</p>
                          {doc ? (
                            editandoVencimento === doc.document_id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <Input type="date" value={vencimentoInput} onChange={(e) => setVencimentoInput(e.target.value)}
                                  className="bg-zinc-950 border-zinc-800 text-white h-6 text-xs w-32" autoFocus />
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-400" onClick={() => salvarVencimento(doc.document_id)}><Check className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-500" onClick={() => setEditandoVencimento(null)}><XIcon className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <button onClick={() => abrirEdicaoVencimento(doc)} data-testid={`checklist-vencimento-${item.item_id}`}
                                className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-white group mt-0.5">
                                {doc.vencimento ? (
                                  <>
                                    <span>Vence {new Date(doc.vencimento).toLocaleDateString('pt-BR')}</span>
                                    {vencStatus && <Badge className={`${vencStatus.className} text-[9px] px-1 py-0`}>{vencStatus.label}</Badge>}
                                    {doc.vencimento_fonte === 'ocr' && <Sparkles className="h-2.5 w-2.5 text-blue-400" title="Sugerido por OCR" />}
                                  </>
                                ) : <span className="italic">definir vencimento</span>}
                                <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
                              </button>
                            )
                          ) : item.descricao ? (
                            <p className="text-[11px] text-zinc-600 truncate">{item.descricao}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px] font-mono">{TIPO_LABELS[item.tipo]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400 font-mono">{doc ? formatFileSize(doc.file_size) : '—'}</TableCell>
                    <TableCell className="text-xs text-zinc-400">{doc ? new Date(doc.created_at).toLocaleDateString('pt-BR') : '—'}</TableCell>
                    <TableCell>
                      <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5`}>
                        <cfg.icon className="h-3 w-3 mr-1" />{cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right"><div className="flex justify-end"><AcoesDocumento item={item} compact /></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        /* ── Visão em grade ── */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {itensFiltrados.map((item) => {
            const cfg = STATUS_CFG[item.status] || STATUS_CFG.pendente;
            const doc = item.documento;
            const Icone = doc ? IconeArquivo(doc.file_name) : FileIcon;
            const preview = doc && previews[doc.document_id];
            return (
              <Card key={item.item_id} data-testid={`checklist-card-${item.item_id}`} className="bg-zinc-900/50 border-zinc-800 overflow-hidden group">
                <div className="h-28 bg-zinc-950 flex items-center justify-center relative border-b border-zinc-800">
                  {preview?.ext === 'pdf' ? (
                    <iframe src={preview.url} title={item.nome} className="w-full h-full pointer-events-none" />
                  ) : preview ? (
                    <img src={preview.url} alt={item.nome} className="w-full h-full object-cover" />
                  ) : (
                    <Icone className="h-9 w-9 text-zinc-700" />
                  )}
                  {doc && (
                    <div className="absolute top-1.5 right-1.5">
                      <button
                        onClick={() => setMenuAberto(menuAberto === doc.document_id ? null : doc.document_id)}
                        className="h-6 w-6 rounded-md bg-zinc-950/80 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {menuAberto === doc.document_id && (
                        <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-10 py-1">
                          <Button variant="ghost" size="sm" onClick={() => { handleDownload(doc.document_id, doc.file_name); setMenuAberto(null); }}
                            className="w-full justify-start gap-2 h-auto px-3 py-1.5 text-xs font-normal"><Download className="h-3.5 w-3.5" /> Baixar</Button>
                          <Button variant="ghost" size="sm" onClick={() => { abrirEdicaoVencimento(doc); setMenuAberto(null); }}
                            className="w-full justify-start gap-2 h-auto px-3 py-1.5 text-xs font-normal"><Pencil className="h-3.5 w-3.5" /> Vencimento</Button>
                          <Button variant="destructive-ghost" size="sm" onClick={() => { handleDelete(doc.document_id); setMenuAberto(null); }}
                            className="w-full justify-start gap-2 h-auto px-3 py-1.5 text-xs font-normal"><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2 mb-1.5 min-h-[2rem]">{item.nome}</p>
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[9px] font-mono">{TIPO_LABELS[item.tipo]}</Badge>
                    <Badge className={`${cfg.className} font-mono uppercase text-[9px] px-1.5 py-0`}><cfg.icon className="h-2.5 w-2.5 mr-0.5" />{cfg.label}</Badge>
                  </div>
                  {doc && <p className="text-[10px] text-zinc-600 font-mono mb-2">{formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>}
                  {!doc && <AcoesDocumento item={item} />}
                  {editandoVencimento === doc?.document_id && (
                    <div className="flex items-center gap-1 mt-2">
                      <Input type="date" value={vencimentoInput} onChange={(e) => setVencimentoInput(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-white h-7 text-xs" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-400" onClick={() => salvarVencimento(doc.document_id)}><Check className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!itemUpload} onOpenChange={(open) => !open && setItemUpload(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Enviar documento</DialogTitle>
          </DialogHeader>
          {itemUpload && (
            <form onSubmit={enviarDocumento} className="space-y-4 mt-2">
              <p className="text-sm text-zinc-300">{itemUpload.nome}</p>
              {itemUpload.descricao && <p className="text-xs text-zinc-500">{itemUpload.descricao}</p>}
              <Input
                type="file"
                data-testid="checklist-file-input"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                className="bg-zinc-950 border-zinc-800 text-white"
                required
              />
              <Button
                type="submit"
                disabled={enviando || !arquivo}
                data-testid="checklist-submit-upload-btn"
                className="w-full bg-primary-500 hover:bg-primary-600 text-white button-shadow"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                {enviando ? 'Enviando...' : 'Enviar Documento'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistContran;
