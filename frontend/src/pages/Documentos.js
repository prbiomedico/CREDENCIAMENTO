import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Upload, FileText, CheckCircle, XCircle, Clock, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const documentTypes = [
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'licenca', label: 'Licença de Funcionamento' },
  { value: 'certidao_fiscal', label: 'Certidão Fiscal' },
  { value: 'certidao_fgts', label: 'Certidão FGTS' },
  { value: 'balanco', label: 'Balanço Patrimonial' },
  { value: 'iso_27001', label: 'ISO 27001' },
  { value: 'iso_27301', label: 'ISO 27301' },
  { value: 'atestado_tecnico', label: 'Atestado Técnico' },
  { value: 'compliance', label: 'Programa de Compliance' },
  { value: 'outros', label: 'Outros' },
];

const Documentos = () => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    document_type: '',
    document_name: '',
    file: null
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      fetchDocuments();
    }
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API}/companies`, { withCredentials: true });
      setCompanies(response.data);
      if (response.data.length > 0) {
        setSelectedCompany(response.data[0].company_id);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Erro ao carregar empresas');
    }
  };

  const fetchDocuments = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/documents/${selectedCompany}`, { withCredentials: true });
      setDocuments(response.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm(prev => ({ ...prev, file }));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!selectedCompany || !uploadForm.document_type || !uploadForm.document_name || !uploadForm.file) {
      toast.error('Preencha todos os campos');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('company_id', selectedCompany);
      formData.append('document_type', uploadForm.document_type);
      formData.append('document_name', uploadForm.document_name);

      await axios.post(`${API}/documents/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Documento enviado com sucesso!');
      setDialogOpen(false);
      setUploadForm({ document_type: '', document_name: '', file: null });
      fetchDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentId, fileName) => {
    try {
      const response = await axios.get(`${API}/documents/download/${documentId}`, {
        withCredentials: true,
        responseType: 'blob',
      });

      // Create blob link to download
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

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pendente', icon: Clock, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      approved: { label: 'Aprovado', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      rejected: { label: 'Rejeitado', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge className={`${config.className} font-mono uppercase text-xs px-2 py-0.5`}>
        <config.icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getDocTypeLabel = (type) => {
    const doc = documentTypes.find((d) => d.value === type);
    return doc ? doc.label : type;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="documentos-page">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Documentos</h1>
            <p className="text-zinc-400">Gerencie documentos de credenciamento das empresas</p>
          </div>
          {companies.length > 0 && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="upload-document-btn"
                  className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Enviar Documento
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                  <DialogTitle className="font-heading text-2xl">Enviar Documento</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpload} className="space-y-4 mt-4">
                  <div>
                    <Label className="text-zinc-300">Tipo de Documento</Label>
                    <Select
                      value={uploadForm.document_type}
                      onValueChange={(value) => setUploadForm(prev => ({ ...prev, document_type: value }))}
                    >
                      <SelectTrigger
                        data-testid="doctype-select"
                        className="bg-zinc-950 border-zinc-800 text-white mt-2"
                      >
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="document_name" className="text-zinc-300">Nome Específico do Documento</Label>
                    <Input
                      id="document_name"
                      data-testid="document-name-input"
                      value={uploadForm.document_name}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, document_name: e.target.value }))}
                      placeholder="Ex: Certidão Federal 2026"
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="file" className="text-zinc-300">Arquivo</Label>
                    <Input
                      id="file"
                      type="file"
                      data-testid="file-input"
                      onChange={handleFileChange}
                      className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white mt-2"
                      required
                    />
                    <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, JPG, PNG (máx. 10MB)</p>
                  </div>

                  <Button
                    data-testid="submit-upload-btn"
                    type="submit"
                    disabled={uploading}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white button-shadow"
                  >
                    {uploading ? 'Enviando...' : 'Enviar Documento'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {companies.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-4">Nenhuma empresa cadastrada</p>
              <p className="text-sm text-zinc-500">Cadastre uma empresa primeiro para gerenciar documentos</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Company Selection */}
            <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
              <CardContent className="p-6">
                <Label className="text-zinc-300 mb-2 block">Selecionar Empresa</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger
                    data-testid="company-select"
                    className="bg-zinc-950 border-zinc-800 text-white"
                  >
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {companies.map((company) => (
                      <SelectItem key={company.company_id} value={company.company_id}>
                        {company.name} ({company.cnpj})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Documents Table */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="font-heading">Documentos Cadastrados</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-zinc-400">Carregando documentos...</p>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-400 mb-4">Nenhum documento enviado para esta empresa</p>
                    <Button
                      data-testid="empty-upload-btn"
                      onClick={() => setDialogOpen(true)}
                      className="bg-orange-500 hover:bg-orange-600 text-white button-shadow"
                    >
                      <Upload className="h-5 w-5 mr-2" />
                      Enviar Primeiro Documento
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-zinc-900/50">
                          <TableHead className="text-zinc-400">Tipo</TableHead>
                          <TableHead className="text-zinc-400">Nome do Documento</TableHead>
                          <TableHead className="text-zinc-400">Arquivo</TableHead>
                          <TableHead className="text-zinc-400">Tamanho</TableHead>
                          <TableHead className="text-zinc-400">Status</TableHead>
                          <TableHead className="text-zinc-400">Data</TableHead>
                          <TableHead className="text-zinc-400 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((doc) => (
                          <TableRow
                            key={doc.document_id}
                            data-testid={`document-row-${doc.document_id}`}
                            className="border-zinc-800 hover:bg-zinc-900/50"
                          >
                            <TableCell className="font-medium text-zinc-300">
                              {getDocTypeLabel(doc.document_type)}
                            </TableCell>
                            <TableCell className="text-zinc-300">{doc.document_name}</TableCell>
                            <TableCell className="font-mono text-sm text-zinc-500">{doc.file_name}</TableCell>
                            <TableCell className="text-sm text-zinc-500">
                              {formatFileSize(doc.file_size)}
                            </TableCell>
                            <TableCell>{getStatusBadge(doc.status)}</TableCell>
                            <TableCell className="text-sm text-zinc-500">
                              {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                data-testid={`download-btn-${doc.document_id}`}
                                onClick={() => handleDownload(doc.document_id, doc.file_name)}
                                variant="ghost"
                                size="sm"
                                className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Documentos;
