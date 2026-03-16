import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Upload, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useDropzone } from 'react-dropzone';
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
  const [selectedDocType, setSelectedDocType] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const onDrop = async (acceptedFiles) => {
    if (!selectedCompany || !selectedDocType) {
      toast.error('Selecione a empresa e o tipo de documento');
      return;
    }

    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', selectedCompany);
      formData.append('document_type', selectedDocType);

      await axios.post(`${API}/documents/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Documento enviado com sucesso!');
      fetchDocuments();
      setSelectedDocType('');
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: !selectedCompany || !selectedDocType || uploading,
  });

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

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="documentos-page">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Documentos</h1>
          <p className="text-zinc-400">Gerencie documentos de credenciamento das empresas</p>
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
            {/* Upload Section */}
            <Card className="bg-zinc-900/50 border-zinc-800 mb-8">
              <CardHeader>
                <CardTitle className="font-heading">Upload de Documentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Selecionar Empresa</label>
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
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Tipo de Documento</label>
                    <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                      <SelectTrigger
                        data-testid="doctype-select"
                        className="bg-zinc-950 border-zinc-800 text-white"
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
                </div>

                <div
                  {...getRootProps()}
                  data-testid="dropzone"
                  className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                    isDragActive
                      ? 'border-orange-500 bg-orange-500/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  } ${
                    !selectedCompany || !selectedDocType || uploading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  {uploading ? (
                    <p className="text-zinc-400">Enviando...</p>
                  ) : isDragActive ? (
                    <p className="text-zinc-400">Solte o arquivo aqui...</p>
                  ) : (
                    <>
                      <p className="text-zinc-400 mb-2">Arraste um arquivo ou clique para selecionar</p>
                      <p className="text-xs text-zinc-600">PDF, DOCX, JPG, PNG até 10MB</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="font-heading">Documentos Enviados</CardTitle>
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
                    <p className="text-zinc-400">Nenhum documento enviado para esta empresa</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.document_id}
                        data-testid={`document-item-${doc.document_id}`}
                        className="flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="p-2 bg-orange-500/10 rounded-lg">
                            <FileText className="h-5 w-5 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm mb-1">{getDocTypeLabel(doc.document_type)}</p>
                            <p className="text-xs text-zinc-500 font-mono truncate">{doc.file_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-zinc-500">
                            {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                          </span>
                          {getStatusBadge(doc.status)}
                        </div>
                      </div>
                    ))}
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