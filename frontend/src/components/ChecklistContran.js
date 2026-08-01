import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, XCircle, Upload, FileText, Download, Trash2, Sparkles, Pencil, Check, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

const ChecklistContran = ({ companyId }) => {
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [itemUpload, setItemUpload] = useState(null); // item sendo enviado (abre o dialog)
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [deletando, setDeletando] = useState(null); // document_id em confirmação de exclusão
  const [editandoVencimento, setEditandoVencimento] = useState(null); // document_id em edição
  const [vencimentoInput, setVencimentoInput] = useState('');

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
      formData.append('document_type', 'outros');
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

  if (!companyId) return null;

  if (loading && !checklist) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-4" />
        <p className="text-zinc-400">Carregando checklist...</p>
      </div>
    );
  }

  if (!checklist) return null;

  const { resumo, blocos } = checklist;
  const pctGeral = resumo.total > 0 ? Math.round((resumo.aprovados / resumo.total) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="checklist-contran">
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
            <span className="text-2xl font-heading font-bold text-orange-400">{pctGeral}%</span>
          </div>
          <Progress value={pctGeral} className="h-2" />
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={blocos.map((b) => `bloco-${b.numero}`)} className="space-y-3">
        {blocos.map((bloco) => {
          const aprovadosBloco = bloco.itens.filter((i) => i.status === 'aprovado').length;
          return (
            <AccordionItem
              key={bloco.numero}
              value={`bloco-${bloco.numero}`}
              className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="text-sm font-semibold text-white text-left">
                    Bloco {bloco.numero} — {bloco.nome}
                  </span>
                  <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 font-mono text-xs ml-3 shrink-0">
                    {aprovadosBloco}/{bloco.itens.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {bloco.itens.map((item) => {
                    const cfg = STATUS_CFG[item.status] || STATUS_CFG.pendente;
                    const doc = item.documento;
                    const vencStatus = doc ? getVencimentoStatus(doc.vencimento) : null;
                    return (
                      <div
                        key={item.item_id}
                        data-testid={`checklist-item-${item.item_id}`}
                        className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-200 font-medium">{item.nome}</p>
                            {item.descricao && (
                              <p className="text-xs text-zinc-500 mt-0.5">{item.descricao}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className={`${cfg.className} font-mono uppercase text-[10px] px-2 py-0.5`}>
                              <cfg.icon className="h-3 w-3 mr-1" />
                              {cfg.label}
                            </Badge>
                            {(item.status === 'pendente' || item.status === 'rejeitado') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => abrirUpload(item)}
                                data-testid={`checklist-enviar-${item.item_id}`}
                                className="h-7 text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                              >
                                <Upload className="h-3.5 w-3.5 mr-1" /> Enviar
                              </Button>
                            )}
                          </div>
                        </div>

                        {doc && (
                          <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                            <span className="font-mono">{doc.file_name}</span>
                            <span>{formatFileSize(doc.file_size)}</span>
                            <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>

                            {editandoVencimento === doc.document_id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="date"
                                  value={vencimentoInput}
                                  onChange={(e) => setVencimentoInput(e.target.value)}
                                  className="bg-zinc-950 border-zinc-800 text-white h-7 text-xs w-36"
                                  autoFocus
                                />
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-400"
                                  onClick={() => salvarVencimento(doc.document_id)}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-500"
                                  onClick={() => setEditandoVencimento(null)}>
                                  <XIcon className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => abrirEdicaoVencimento(doc)}
                                data-testid={`checklist-vencimento-${item.item_id}`}
                                className="flex items-center gap-1.5 hover:text-white text-zinc-400 group"
                                title="Clique para editar o vencimento"
                              >
                                {doc.vencimento ? (
                                  <>
                                    <span>Vence: {new Date(doc.vencimento).toLocaleDateString('pt-BR')}</span>
                                    {vencStatus && (
                                      <Badge className={`${vencStatus.className} text-[10px] px-1.5 py-0`}>
                                        {vencStatus.label}
                                      </Badge>
                                    )}
                                    {doc.vencimento_fonte === 'ocr' && (
                                      <Sparkles className="h-3 w-3 text-blue-400" title="Sugerido por OCR" />
                                    )}
                                  </>
                                ) : (
                                  <span className="italic">definir vencimento</span>
                                )}
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
                              </button>
                            )}

                            <div className="ml-auto flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownload(doc.document_id, doc.file_name)}
                                data-testid={`checklist-download-${item.item_id}`}
                                className="h-7 w-7 p-0 text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {deletando === doc.document_id ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(doc.document_id)}
                                  data-testid={`checklist-delete-confirm-${item.item_id}`}
                                  className="h-7 text-red-500 hover:text-red-400 hover:bg-red-500/10 px-2"
                                >
                                  Confirmar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(doc.document_id)}
                                  data-testid={`checklist-delete-${item.item_id}`}
                                  className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

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
                className="w-full bg-orange-500 hover:bg-orange-600 text-white button-shadow"
              >
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
