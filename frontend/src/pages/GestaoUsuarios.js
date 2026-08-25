import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import {
  UserCog, Plus, Search, Shield, Building2, Landmark,
  CreditCard, Trash2, RefreshCw, ChevronDown, Check, X, Eye, EyeOff,
  ClipboardList, ThumbsUp, ThumbsDown
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;

const PERFIS = {
  sigcr_admin:       { label: 'Admin SIGCR',    color: 'bg-primary-500/20 text-primary-400 border-primary-500/30',   icon: Shield },
  detran_admin:      { label: 'Admin DETRAN',   color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',         icon: Landmark },
  detran:            { label: 'Operador DETRAN', color: 'bg-blue-500/10 text-blue-300 border-blue-500/20',         icon: Landmark },
  registradora:      { label: 'Registradora',   color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',         icon: Building2 },
  financeira:        { label: 'Financeira',     color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CreditCard },
};

const TODAS_ROLES = [
  { value: 'registradora',  label: 'Registradora',    desc: 'Acesso ao mdulo de credenciamento e documentos', icon: Building2,  color: 'primary' },
  { value: 'detran',        label: 'Operador DETRAN',  desc: 'Acesso ao painel DETRAN e gesto de editais',     icon: Landmark,   color: 'blue' },
  { value: 'detran_admin',  label: 'Admin DETRAN',     desc: 'Acesso total ao mdulo DETRAN + configuraes',   icon: Landmark,   color: 'blue' },
  { value: 'financeira',    label: 'Financeira',       desc: 'Acesso a contratos e gravames',                   icon: CreditCard, color: 'emerald' },
  { value: 'sigcr_admin',   label: 'Admin SIGCR',      desc: 'Acesso total ao sistema  todas as camadas',      icon: Shield,     color: 'primary' },
];

// Hierarquia LGPD: cada perfil s cria quem est abaixo dele
const ROLES_POR_PERFIL = {
  sigcr_admin:      ['registradora', 'detran', 'detran_admin', 'financeira', 'sigcr_admin'],
  detran_admin:     ['registradora', 'detran'],
  detran:           ['registradora'],
  registradora:     ['financeira'],
  financeira:       [],
};

const EMPTY_FORM = { username: '', email: '', firstName: '', lastName: '', password: '', role: 'registradora', uf: '', enabled: true };

const TIPO_EMPRESA_LABELS = { registradora: 'Registradora', financeira: 'Financeira', detran: 'DETRAN' };

export default function GestaoUsuarios() {
  const { user, initialized } = useAuth();
  const { toast } = useToast();

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deletando, setDeletando] = useState(null);

  const [cadastrosPendentes, setCadastrosPendentes] = useState([]);
  const [loadingCadastros, setLoadingCadastros] = useState(true);
  const [processando, setProcessando] = useState(null);
  const [rejeicaoAlvo, setRejeicaoAlvo] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  // Roles que este usuário pode criar  baseado na hierarquia LGPD
  const perfilAtual = user?.perfil || user?.roles?.[0] || 'financeira';
  const rolesPermitidas = ROLES_POR_PERFIL[perfilAtual] || [];
  const ROLES_DISPONIVEIS = TODAS_ROLES.filter(r => rolesPermitidas.includes(r.value));

  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  useEffect(() => {
    if (!initialized || !user) return;
    fetchUsuarios();
    fetchCadastrosPendentes();
  }, [initialized, user]);

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/usuarios`, { withCredentials: true });
      setUsuarios(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast({ title: 'Erro ao carregar usuários', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCadastrosPendentes = async () => {
    setLoadingCadastros(true);
    try {
      const res = await axios.get(`${API}/admin/cadastros-pendentes`, { withCredentials: true });
      setCadastrosPendentes(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast({ title: 'Erro ao carregar cadastros pendentes', variant: 'destructive' });
    } finally {
      setLoadingCadastros(false);
    }
  };

  const handleAprovar = async (cadastro) => {
    setProcessando(cadastro.company_id);
    try {
      await axios.post(`${API}/admin/cadastros/${cadastro.company_id}/aprovar`, {}, { withCredentials: true });
      toast({ title: 'Cadastro aprovado', description: cadastro.nome_fantasia });
      await fetchCadastrosPendentes();
    } catch (e) {
      toast({ title: 'Erro ao aprovar', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setProcessando(null);
    }
  };

  const handleRejeitar = async () => {
    if (!rejeicaoAlvo) return;
    setProcessando(rejeicaoAlvo.company_id);
    try {
      await axios.post(`${API}/admin/cadastros/${rejeicaoAlvo.company_id}/rejeitar`,
        { motivo: motivoRejeicao || null }, { withCredentials: true });
      toast({ title: 'Cadastro rejeitado', description: rejeicaoAlvo.nome_fantasia });
      setRejeicaoAlvo(null);
      setMotivoRejeicao('');
      await fetchCadastrosPendentes();
    } catch (e) {
      toast({ title: 'Erro ao rejeitar', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setProcessando(null);
    }
  };

  const handleSalvar = async () => {
    if (!form.username || !form.email || !form.password || !form.role) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/admin/usuarios`, form, { withCredentials: true });
      toast({ title: ' Usuário criado com sucesso', description: `${form.email}  perfil: ${PERFIS[form.role]?.label}` });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchUsuarios();
    } catch (e) {
      toast({ title: 'Erro ao criar usuário', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletar = async (userId, username) => {
    if (deletando !== userId) { setDeletando(userId); return; }
    try {
      await axios.delete(`${API}/admin/usuarios/${userId}`, { withCredentials: true });
      toast({ title: `Usuário ${username} removido` });
      setDeletando(null);
      await fetchUsuarios();
    } catch (e) {
      toast({ title: 'Erro ao remover', description: e.response?.data?.detail, variant: 'destructive' });
    }
  };

  const usuariosFiltrados = usuarios.filter(u =>
    u.username?.toLowerCase().includes(busca.toLowerCase()) ||
    u.email?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500/10 border border-primary-500/20 rounded-lg flex items-center justify-center">
              <UserCog className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Gestão de Usuários</h1>
              <p className="text-zinc-500 text-sm">Controle de acesso baseado na hierarquia LGPD</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="usuarios" className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="usuarios" className="data-[state=active]:bg-primary-500/20 data-[state=active]:text-primary-400">
              <UserCog className="h-4 w-4 mr-2" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="pendentes" className="data-[state=active]:bg-primary-500/20 data-[state=active]:text-primary-400">
              <ClipboardList className="h-4 w-4 mr-2" /> Cadastros Pendentes
              {cadastrosPendentes.length > 0 && (
                <Badge className="ml-2 bg-primary-500 text-white border-0 h-5 min-w-5 px-1.5 flex items-center justify-center text-[11px]">
                  {cadastrosPendentes.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios" className="space-y-6 mt-4">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsuarios}
            className="border-zinc-700 text-zinc-400 hover:text-white">
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button onClick={() => setShowForm(!showForm)}
            className="bg-primary-500 hover:bg-primary-600 text-white">
            <Plus className="h-4 w-4 mr-2" /> Novo Usuário
          </Button>
        </div>

        {/* Hierarquia visual */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">Hierarquia de Acesso (LGPD — Princípio do Mínimo Privilégio)</p>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                { label: 'Admin SIGCR', color: 'text-primary-400', desc: 'Todas as camadas' },
                { label: '', color: 'text-zinc-600', desc: '' },
                { label: 'DETRAN', color: 'text-blue-400', desc: 'Registradoras sob sua jurisdio' },
                { label: '', color: 'text-zinc-600', desc: '' },
                { label: 'Registradora', color: 'text-zinc-300', desc: 'Financeiras que usam seus servios' },
                { label: '', color: 'text-zinc-600', desc: '' },
                { label: 'Financeira', color: 'text-emerald-400', desc: 'Apenas seus contratos' },
              ].map((item, i) => (
                <span key={i} className={`font-mono font-semibold ${item.color}`}>
                  {item.label}{item.desc && <span className="text-zinc-600 font-normal ml-1">({item.desc})</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Formulrio de criao */}
        {showForm && (
          <Card className="border-primary-500/30 bg-zinc-900/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary-400" /> Novo Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Seletor de Perfil */}
              <div>
                <label className="text-xs text-zinc-400 font-mono uppercase tracking-wider mb-2 block">Perfil de Acesso *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ROLES_DISPONIVEIS.map(r => {
                    const Icon = r.icon;
                    const isSelected = form.role === r.value;
                    return (
                      <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? `border-${r.color}-500/50 bg-${r.color}-500/10`
                            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 ${isSelected ? `text-${r.color}-400` : 'text-zinc-500'}`} />
                          <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-zinc-400'}`}>{r.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary-400 ml-auto" />}
                        </div>
                        <p className="text-[11px] text-zinc-500">{r.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'username', label: 'Username *', placeholder: 'ex: joao.silva' },
                  { key: 'email',    label: 'E-mail *',   placeholder: 'ex: joao@empresa.com.br' },
                  { key: 'firstName',label: 'Nome',       placeholder: 'Joo' },
                  { key: 'lastName', label: 'Sobrenome',  placeholder: 'Silva' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-zinc-400 font-mono mb-1 block">{f.label}</label>
                    <input
                      value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/60"
                    />
                  </div>
                ))}

                {/* Senha */}
                <div>
                  <label className="text-xs text-zinc-400 font-mono mb-1 block">Senha *</label>
                  <div className="relative">
                    <input
                      type={showSenha ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Mnimo 8 caracteres"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/60 pr-10"
                    />
                    <button onClick={() => setShowSenha(!showSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* UF (para DETRAN) */}
                {(form.role === 'detran' || form.role === 'detran_admin') && (
                  <div>
                    <label className="text-xs text-zinc-400 font-mono mb-1 block">UF do DETRAN *</label>
                    <select value={form.uf} onChange={e => setForm(p => ({ ...p, uf: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500/60">
                      <option value="">Selecione o estado</option>
                      {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSalvar} disabled={saving} className="bg-primary-500 hover:bg-primary-600 text-white">
                  {saving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Criando...</> : <><Check className="h-4 w-4 mr-2" />Criar Usuário</>}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  className="border-zinc-700 text-zinc-400">
                  <X className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por username ou e-mail..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/40" />
        </div>

        {/* Lista de usuários */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <UserCog className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400">Nenhum usuário encontrado</p>
              <p className="text-zinc-600 text-sm mt-1">Crie o primeiro usuário usando o botão acima</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {usuariosFiltrados.map(u => {
              const perfilCfg = PERFIS[u.perfil] || PERFIS['registradora'];
              const PerfilIcon = perfilCfg.icon;
              const isConfirmDelete = deletando === u.id;
              return (
                <Card key={u.id} className="border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-primary-500/20 border border-primary-500/20 flex items-center justify-center text-primary-400 font-bold text-sm shrink-0">
                      {u.firstName?.[0] || u.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-zinc-500 font-mono">@{u.username}</span>
                        {!u.enabled && <Badge className="bg-red-900/30 text-red-400 border-red-800 text-[10px]">Desativado</Badge>}
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-xs border flex items-center gap-1 ${perfilCfg.color}`}>
                        <PerfilIcon className="h-3 w-3" />
                        {perfilCfg.label}
                      </Badge>
                      {u.uf && <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs font-mono">{u.uf}</Badge>}
                      {isConfirmDelete ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => handleDeletar(u.id, u.username)}
                            className="bg-red-600 hover:bg-red-700 text-white h-7 px-2 text-xs">
                            Confirmar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeletando(null)}
                            className="text-zinc-400 h-7 px-2">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleDeletar(u.id, u.username)}
                          className="text-zinc-600 hover:text-red-400 h-7 w-7 p-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-center text-zinc-600 text-xs font-mono">{usuariosFiltrados.length} usuário(s)</p>
          </TabsContent>

          <TabsContent value="pendentes" className="space-y-6 mt-4">
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={fetchCadastrosPendentes}
                className="border-zinc-700 text-zinc-400 hover:text-white">
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
            </div>

            {loadingCadastros ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : cadastrosPendentes.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <ClipboardList className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-400">Nenhum cadastro pendente</p>
                  <p className="text-zinc-600 text-sm mt-1">Novos cadastros de empresas aparecerão aqui para aprovação</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400">Empresa</TableHead>
                        <TableHead className="text-zinc-400">CNPJ</TableHead>
                        <TableHead className="text-zinc-400">Tipo</TableHead>
                        <TableHead className="text-zinc-400">Responsável</TableHead>
                        <TableHead className="text-zinc-400">Data do Cadastro</TableHead>
                        <TableHead className="text-zinc-400 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cadastrosPendentes.map(c => (
                        <TableRow key={c.company_id} className="border-zinc-800">
                          <TableCell className="text-white">
                            <div className="font-semibold">{c.nome_fantasia}</div>
                            <div className="text-xs text-zinc-500">{c.name}</div>
                            {c.historico_rejeicoes?.length > 0 && (
                              <Badge className="mt-1 bg-red-900/30 text-red-400 border-red-800 text-[10px]">
                                Reenviado após {c.historico_rejeicoes.length}x rejeição
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-zinc-400 font-mono text-sm">{c.cnpj}</TableCell>
                          <TableCell>
                            <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">
                              {c.tipo_empresa_label || c.tipo_empresa}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-zinc-300 text-sm">
                            <div>{c.responsavel?.nome || '—'}</div>
                            <div className="text-xs text-zinc-500">{c.responsavel_email_conta || c.email_comercial}</div>
                          </TableCell>
                          <TableCell className="text-zinc-400 text-sm">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" disabled={processando === c.company_id} onClick={() => handleAprovar(c)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs">
                                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" /> Aprovar
                              </Button>
                              <Button size="sm" variant="outline" disabled={processando === c.company_id}
                                onClick={() => { setRejeicaoAlvo(c); setMotivoRejeicao(''); }}
                                className="border-red-800 text-red-400 hover:bg-red-950 h-8 px-3 text-xs">
                                <ThumbsDown className="h-3.5 w-3.5 mr-1.5" /> Rejeitar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <p className="text-center text-zinc-600 text-xs font-mono">{cadastrosPendentes.length} cadastro(s) pendente(s)</p>
          </TabsContent>
        </Tabs>

        {/* Modal de rejeição */}
        {rejeicaoAlvo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setRejeicaoAlvo(null)} />
            <Card className="relative z-10 w-full max-w-md border-zinc-700 bg-zinc-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-red-400" /> Rejeitar cadastro
                </CardTitle>
                <p className="text-xs text-zinc-500">{rejeicaoAlvo.nome_fantasia} — {rejeicaoAlvo.cnpj}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 font-mono mb-1 block">Motivo (opcional)</label>
                  <Textarea
                    value={motivoRejeicao}
                    onChange={e => setMotivoRejeicao(e.target.value)}
                    placeholder="Ex: documento ilegível, CNPJ divergente do contrato social..."
                    className="bg-zinc-800 border-zinc-700 text-white placeholder-zinc-600 text-sm min-h-[90px]"
                  />
                  <p className="text-[11px] text-zinc-600 mt-1">O responsável poderá corrigir os dados e reenviar o cadastro.</p>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" onClick={() => setRejeicaoAlvo(null)}
                    className="border-zinc-700 text-zinc-400">
                    Cancelar
                  </Button>
                  <Button onClick={handleRejeitar} disabled={processando === rejeicaoAlvo.company_id}
                    className="bg-red-600 hover:bg-red-700 text-white">
                    {processando === rejeicaoAlvo.company_id
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Rejeitando...</>
                      : <><ThumbsDown className="h-4 w-4 mr-2" />Confirmar Rejeição</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
