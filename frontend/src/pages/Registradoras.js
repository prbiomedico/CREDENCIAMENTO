import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Building2, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  FileText, ListChecks,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const STATUS_EMPRESA_CFG = {
  pending: { label: 'Pendente', icon: Clock, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  pendente_aprovacao: { label: 'Pendente', icon: Clock, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  approved: { label: 'Aprovada', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  aprovado_acesso_limitado: { label: 'Acesso Limitado', icon: CheckCircle, className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ativo_contrato_assinado: { label: 'Contrato Ativo', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  rejected: { label: 'Rejeitada', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  rejeitado: { label: 'Rejeitada', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

const STATUS_SUBMISSAO_CFG = {
  rascunho: { label: 'Rascunho', className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  submetido: { label: 'Submetido', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  em_analise: { label: 'Em Análise', icon: Clock, className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  em_diligencia: { label: 'Em Diligência', icon: FileText, className: 'bg-primary-500/10 text-primary-400 border-primary-500/20' },
  homologado: { label: 'Homologado', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
};

const STATUS_ITEM_CFG = {
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  enviado: { label: 'Enviado', icon: FileText, className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  conforme: { label: 'Conforme', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  inconforme: { label: 'Inconforme', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

const COMPLIANCE_CFG = {
  vencido: { label: 'Doc. Vencido', icon: XCircle, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  vencendo: { label: 'Doc. Vencendo', icon: Clock, className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  valido: { label: 'Em Dia', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
};

const badge = (cfg, key, extra = '') => {
  const c = cfg[key] || cfg.pendente || Object.values(cfg)[0];
  return (
    <Badge className={`${c.className} font-mono uppercase text-[10px] px-2 py-0.5 ${extra}`}>
      {c.icon && <c.icon className="h-3 w-3 mr-1" />}{c.label}
    </Badge>
  );
};

const Registradoras = () => {
  const { user, initialized } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link do Dashboard (Item 1, 2026-08-27): DOCUMENTOS/PENDÊNCIAS/Semáforo
  // do DETRAN não tinham destino real — viraram um filtro nesta mesma tela
  // em vez de uma tela nova, já que a lista de registradoras é exatamente o
  // escopo (por UF) que GET /stats passou a usar depois do fix do item 44.
  const complianceFiltro = searchParams.get('compliance'); // vencido|vencendo|valido
  const pendenciasFiltro = searchParams.get('pendencias') === '1';
  const [ufs, setUfs] = useState([]);
  const [estadoSigla, setEstadoSigla] = useState(user?.detran_uf || '');
  const [registradoras, setRegistradoras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandidas, setExpandidas] = useState({});

  const ehAdmin = user?.perfil === 'sigcr_admin';

  useEffect(() => {
    if (!ehAdmin) return;
    axios.get(`${API}/estados`, { withCredentials: true })
      .then((res) => setUfs(Array.isArray(res.data) ? res.data.filter((e) => e.configurado) : []))
      .catch(() => {});
  }, [ehAdmin]);

  const fetchRegistradoras = useCallback(async () => {
    if (!estadoSigla) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/detran/registradoras`, {
        withCredentials: true, params: { estado_sigla: estadoSigla },
      });
      setRegistradoras(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Erro ao carregar registradoras:', error);
      toast.error('Erro ao carregar registradoras');
    } finally {
      setLoading(false);
    }
  }, [estadoSigla]);

  useEffect(() => { if (initialized) fetchRegistradoras(); }, [initialized, fetchRegistradoras]);

  const registradorasFiltradas = (complianceFiltro || pendenciasFiltro)
    ? registradoras.filter((r) => (
        (!complianceFiltro || r.compliance === complianceFiltro) &&
        (!pendenciasFiltro || r.docs_pendentes > 0)
      ))
    : registradoras;

  const toggleExpandida = (companyId) => setExpandidas((p) => ({ ...p, [companyId]: !p[companyId] }));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8" data-testid="registradoras-page">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary-400" />
              Registradoras
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Cadastro e status de credenciamento por portaria das registradoras que atuam nesta UF
            </p>
          </div>
          {ehAdmin && (
            <Select value={estadoSigla} onValueChange={setEstadoSigla}>
              <SelectTrigger className="w-48 bg-zinc-900 border-zinc-700 text-white">
                <SelectValue placeholder="Selecione a UF" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                {ufs.map((e) => (
                  <SelectItem key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {(complianceFiltro || pendenciasFiltro) && (
          <div className="flex items-center gap-2 text-sm bg-primary-500/10 border border-primary-500/20 rounded-lg px-4 py-2 w-fit">
            <span className="text-primary-300">
              Filtrando: {complianceFiltro && <span className="font-mono uppercase">compliance={complianceFiltro}</span>}
              {complianceFiltro && pendenciasFiltro && ' · '}
              {pendenciasFiltro && 'com documentos pendentes'}
              {' '}({registradorasFiltradas.length} de {registradoras.length})
            </span>
            <button
              type="button"
              onClick={() => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('compliance'); p.delete('pendencias'); return p; })}
              className="text-primary-400 hover:text-primary-200 underline text-xs"
            >
              limpar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando...</span>
          </div>
        ) : !estadoSigla ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center text-zinc-400">Selecione uma UF para ver as registradoras.</CardContent>
          </Card>
        ) : registradorasFiltradas.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">
                {registradoras.length === 0
                  ? `Nenhuma registradora atuando em ${estadoSigla} ainda.`
                  : 'Nenhuma registradora corresponde a este filtro.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {registradorasFiltradas.map((r) => {
              const expandida = !!expandidas[r.company_id];
              return (
                <Card key={r.company_id} className="bg-zinc-900/50 border-zinc-800" data-testid={`registradora-card-${r.company_id}`}>
                  <CardContent className="p-5">
                    <button
                      onClick={() => toggleExpandida(r.company_id)}
                      className="w-full flex items-start justify-between gap-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <p className="text-white font-semibold">{r.name}</p>
                          {badge(STATUS_EMPRESA_CFG, r.status)}
                        </div>
                        <p className="text-sm text-zinc-400">{r.nome_fantasia}</p>
                        <p className="text-xs font-mono text-zinc-500 mt-0.5">CNPJ: {r.cnpj}</p>
                        {(complianceFiltro || pendenciasFiltro) && r.compliance && (
                          <div className="mt-1.5">{badge(COMPLIANCE_CFG, r.compliance)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right text-xs text-zinc-500">
                          <p>{r.total_portarias_respondidas} portaria(s) respondida(s)</p>
                          <p>{r.total_homologadas} homologada(s)</p>
                          {(complianceFiltro || pendenciasFiltro) && (
                            <p>{r.docs_pendentes} doc(s) pendente(s)</p>
                          )}
                        </div>
                        {expandida ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
                      </div>
                    </button>

                    {expandida && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-zinc-500 mb-1">Email Comercial:</p>
                            <p className="text-zinc-300">{r.email_comercial}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 mb-1">Gestor do Contrato:</p>
                            <p className="text-zinc-300">{r.gestor_contrato}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 mb-1">Endereço:</p>
                            <p className="text-zinc-300">{r.endereco || '—'}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500 mb-1">WhatsApp:</p>
                            <p className="text-zinc-300">{r.whatsapp || '—'}</p>
                          </div>
                        </div>
                        {r.detrans_atuacao?.length > 0 && (
                          <div>
                            <p className="text-xs text-zinc-500 mb-2">DETRANs de Atuação:</p>
                            <div className="flex flex-wrap gap-2">
                              {r.detrans_atuacao.map((uf) => (
                                <Badge key={uf} className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">DETRAN-{uf}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                            <ListChecks className="h-3.5 w-3.5" /> Credenciamento por Portaria
                          </p>
                          {r.submissoes.length === 0 ? (
                            <p className="text-sm text-zinc-500">Nenhuma submissão ainda para portarias desta UF.</p>
                          ) : (
                            <div className="space-y-3">
                              {r.submissoes.map((s) => (
                                <div key={s.submissao_id} className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3">
                                  <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                    <p className="text-sm text-zinc-200">
                                      {s.portaria_numero ? `${s.portaria_numero} — ` : ''}{s.portaria_titulo || s.portaria_id}
                                    </p>
                                    {badge(STATUS_SUBMISSAO_CFG, s.status)}
                                  </div>
                                  <p className="text-xs text-zinc-500 mb-2">
                                    {s.itens_conforme}/{s.total_itens} itens conformes
                                    {s.itens_inconforme > 0 && ` · ${s.itens_inconforme} inconforme(s)`}
                                    {s.itens_pendentes > 0 && ` · ${s.itens_pendentes} pendente(s)`}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.itens.map((item) => (
                                      <span key={item.item_id} title={item.justificativa || item.nome}>
                                        {badge(STATUS_ITEM_CFG, item.status)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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

export default Registradoras;
