import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { usePerfilAtivo } from '../contexts/PerfilAtivoContext';
import { toast } from 'sonner';
import ChecklistContran from '../components/ChecklistContran';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Tipos de empresa que este seletor sabe filtrar — o badge "DETRAN" não
// corresponde a um tipo_empresa, então nesse caso não filtramos (a rota já
// é restrita a registradora/financeira; ver App.js).
const TIPO_EMPRESA_LABEL = { registradora: 'Registradora', financeira: 'Financeira' };

const Documentos = () => {
  const { user, initialized, getToken } = useAuth();
  const { perfilAtivo } = usePerfilAtivo();
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  const tipoEmpresaAtivo = TIPO_EMPRESA_LABEL[perfilAtivo] ? perfilAtivo : null;

  useEffect(() => { if (!initialized || !user) return; fetchCompanies(); }, [initialized, user, perfilAtivo]);

  const fetchCompanies = async () => {
    try { await getToken(); } catch {}
    try {
      const response = await axios.get(`${API}/companies`, {
        withCredentials: true,
        params: tipoEmpresaAtivo ? { tipo_empresa: tipoEmpresaAtivo } : {},
      });
      const companies = Array.isArray(response.data) ? response.data : [];
      setCompanies(companies);
      setSessaoExpirada(false);
      // Sempre reseta pra primeira empresa da lista atual — evita manter
      // selecionada uma empresa de um tipo_empresa diferente do badge após
      // a troca de perfil (a lista antiga já não é mais válida aqui).
      setSelectedCompany(companies.length > 0 ? companies[0].company_id : '');
    } catch (error) {
      console.error('Error fetching companies:', error);
      if (error?.response?.status === 401) {
        // Empresa(s) podem existir de verdade — não sabemos, porque nem
        // chegamos a perguntar. Mostrar "nenhuma empresa cadastrada" aqui
        // mascararia um problema de sessão como se fosse ausência de dado.
        setSessaoExpirada(true);
        toast.error('Sessão expirada — recarregue a página');
      } else {
        toast.error('Erro ao carregar empresas');
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8" data-testid="documentos-page">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold tracking-tight mb-2">Documentos</h1>
          <p className="text-zinc-400">
            {user?.perfil === 'financeira'
              ? 'Checklist de documentos exigidos pra credenciamento'
              : 'Checklist de documentos exigidos pela Resolução CONTRAN 807'}
          </p>
        </div>

        {sessaoExpirada ? (
          <Card className="bg-amber-950/20 border-amber-900/50">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-amber-700 mx-auto mb-4" />
              <p className="text-amber-400 mb-4">Sessão expirada</p>
              <p className="text-sm text-zinc-500 mb-4">Não foi possível confirmar sua autenticação — isso não significa que você não tem empresas cadastradas.</p>
              <Button onClick={() => window.location.reload()} className="bg-primary-500 hover:bg-primary-600 text-white">
                Recarregar página
              </Button>
            </CardContent>
          </Card>
        ) : companies.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-4">
                {tipoEmpresaAtivo
                  ? `Nenhuma empresa do tipo ${TIPO_EMPRESA_LABEL[tipoEmpresaAtivo]} cadastrada ainda`
                  : 'Nenhuma empresa cadastrada'}
              </p>
              <p className="text-sm text-zinc-500">Cadastre uma empresa primeiro para gerenciar documentos</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Company Selection */}
            <Card className="bg-card border-border mb-8">
              <CardContent className="p-6">
                <Label className="text-zinc-300 mb-2 block">Selecionar Empresa</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger
                    data-testid="company-select"
                    className="bg-background border-border text-white"
                  >
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-white">
                    {companies.map((company) => (
                      <SelectItem key={company.company_id} value={company.company_id}>
                        {company.name} ({company.cnpj})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <ChecklistContran companyId={selectedCompany} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Documentos;
