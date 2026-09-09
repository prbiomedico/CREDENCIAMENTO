import { useState, useEffect, useCallback } from 'react';
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
  ClipboardList, ThumbsUp, ThumbsDown, Users, UserCheck, UserX
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;

const PERFIS = {
  sigcr_admin:       { label: 'Admin SIGCR',    color: 'bg-primary-500/20 text-primary-400 border-primary-500/30',   icon: Shield },
  detran_admin:      { label: 'Admin DETRAN',   color: 'bg-sky-500/20 text-sky-400 border-sky-500/30',         icon: Landmark },
  detran:            { label: 'Operador DETRAN', color: 'bg-sky-500/10 text-sky-300 border-sky-500/20',         icon: Landmark },
  registradora:      { label: 'Registradora',   color: 'bg-zinc-500/20 text-slate-700 border-zinc-500/30',         icon: Building2 },
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
  const [filtroPerfil, setFiltroPerfil] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [showForm, setShowForm] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deletando, setDeletando] = useState(null);
  const [alterandoStatus, setAlterandoStatus] = useState(null);

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

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/admin/usuarios`, { withCredentials: true });
      setUsuarios(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast({ title: 'Erro ao carregar usuários', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchCadastrosPendentes = useCallback(async () => {
    setLoadingCadastros(true);
    try {
      const res = await axios.get(`${API}/admin/cadastros-pendentes`, { withCredentials: true });
      setCadastrosPendentes(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast({ title: 'Erro ao carregar cadastros pendentes', variant: 'destructive' });
    } finally {
      setLoadingCadastros(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!initialized || !user) return;
    fetchUsuarios();
    fetchCadastrosPendentes();
  }, [initialized, user, fetchUsuarios, fetchCadastrosPendentes]);

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

  const handleStatus = async (usuario) => {
    setAlterandoStatus(usuario.id);
    try {
      await axios.patch(`${API}/admin/usuarios/${usuario.id}/status`, { enabled: !usuario.enabled }, { withCredentials: true });
      toast({ title: usuario.enabled ? 'Usuário desativado' : 'Usuário ativado', description: usuario.email });
      await fetchUsuarios();
    } catch (e) {
      toast({ title: 'Não foi possível alterar o acesso', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setAlterandoStatus(null);
    }
  };

  const usuariosFiltrados = usuarios.filter(u => {
    const termo = busca.toLowerCase().trim();
    const combinaBusca = !termo || [u.username, u.email, u.firstName, u.lastName]
      .some(valor => valor?.toLowerCase().includes(termo));
    const combinaPerfil = filtroPerfil === 'todos' || u.perfil === filtroPerfil;
    const combinaStatus = filtroStatus === 'todos' || (filtroStatus === 'ativos' ? u.enabled : !u.enabled);
    return combinaBusca && combinaPerfil && combinaStatus;
  });

  const totalAtivos = usuarios.filter(u => u.enabled).length;
  const totalInativos = usuarios.length - totalAtivos;
  const totalDetran = usuarios.filter(u => ['detran', 'detran_admin'].includes(u.perfil)).length;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500/10 border border-primary-500/20 rounded-lg flex items-center justify-center">
              <UserCog className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestão de Usuários</h1>
              <p className="text-slate-500 text-sm">Identidades, perfis, acesso por UF e aprovação de novas empresas.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Usuários cadastrados', value: usuarios.length, detail: 'Identidades no Keycloak', icon: Users },
            { label: 'Acessos ativos', value: totalAtivos, detail: `${usuarios.length ? Math.round((totalAtivos / usuarios.length) * 100) : 0}% da base`, icon: UserCheck },
            { label: 'Acessos inativos', value: totalInativos, detail: 'Contas sem acesso', icon: UserX },
            { label: 'Equipe DETRAN', value: totalDetran, detail: 'Operadores e administradores', icon: Landmark },
          ].map(item => (
            <Card key={item.label} className="bg-white"><CardContent className="p-4"><div className="flex items-start justify-between"><p className="text-xs font-medium text-slate-500">{item.label}</p><item.icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="usuarios" className="w-full">
          <TabsList className="bg-card border border-border">
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
            className="border-input text-slate-600 hover:text-foreground">
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button onClick={() => setShowForm(!showForm)}
            className="bg-primary-500 hover:bg-primary-600 text-white">
            <Plus className="h-4 w-4 mr-2" /> Novo Usuário
          </Button>
        </div>

        {/* Hierarquia visual */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-3">Hierarquia de Acesso (LGPD — Princípio do Mínimo Privilégio)</p>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                { label: 'Admin SIGCR', color: 'text-primary-400', desc: 'Todas as camadas' },
                { label: '', color: 'text-slate-400', desc: '' },
                { label: 'DETRAN', color: 'text-sky-400', desc: 'Registradoras sob sua jurisdio' },
                { label: '', color: 'text-slate-400', desc: '' },
                { label: 'Registradora', color: 'text-slate-700', desc: 'Financeiras que usam seus servios' },
                { label: '', color: 'text-slate-400', desc: '' },
                { label: 'Financeira', color: 'text-emerald-400', desc: 'Apenas seus contratos' },
              ].map((item, i) => (
                <span key={i} className={`font-mono font-semibold ${item.color}`}>
                  {item.label}{item.desc && <span className="text-slate-400 font-normal ml-1">({item.desc})</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Formulrio de criao */}
        {showForm && (
          <Card className="border-primary-500/30 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary-400" /> Novo Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Seletor de Perfil */}
              <div>
                <label className="text-xs text-slate-600 font-mono uppercase tracking-wider mb-2 block">Perfil de Acesso *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ROLES_DISPONIVEIS.map(r => {
                    const Icon = r.icon;
                    const isSelected = form.role === r.value;
                    return (
                      <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? `border-${r.color}-500/50 bg-${r.color}-500/10`
                            : 'border-input bg-card hover:border-zinc-600'
                        }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 ${isSelected ? `text-${r.color}-400` : 'text-slate-500'}`} />
                          <span className={`text-sm font-semibold ${isSelected ? 'text-foreground' : 'text-slate-600'}`}>{r.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary-400 ml-auto" />}
                        </div>
                        <p className="text-[11px] text-slate-500">{r.desc}</p>
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
                    <label className="text-xs text-slate-600 font-mono mb-1 block">{f.label}</label>
                    <input
                      value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 bg-muted border border-input rounded-lg text-sm text-foreground placeholder-zinc-600 focus:outline-none focus:border-primary-500/60"
                    />
                  </div>
                ))}

                {/* Senha */}
                <div>
                  <label className="text-xs text-slate-600 font-mono mb-1 block">Senha *</label>
                  <div className="relative">
                    <input
                      type={showSenha ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Mnimo 8 caracteres"
                      className="w-full px-3 py-2 bg-muted border border-input rounded-lg text-sm text-foreground placeholder-zinc-600 focus:outline-none focus:border-primary-500/60 pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setShowSenha(!showSenha)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-500 hover:text-slate-700">
                      {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* UF (para DETRAN) */}
                {(form.role === 'detran' || form.role === 'detran_admin') && (
                  <div>
                    <label className="text-xs text-slate-600 font-mono mb-1 block">UF do DETRAN *</label>
                    <select value={form.uf} onChange={e => setForm(p => ({ ...p, uf: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary-500/60">
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
                  className="border-input text-slate-600">
                  <X className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros operacionais */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar nome, usuário ou e-mail..."
              className="h-9 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-slate-200" />
          </div>
          <select value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)} className="h-9 rounded-md border border-input bg-white px-3 text-sm text-slate-700 lg:w-48">
            <option value="todos">Todos os perfis</option>
            {Object.entries(PERFIS).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="h-9 rounded-md border border-input bg-white px-3 text-sm text-slate-700 lg:w-40">
            <option value="todos">Todos os status</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>

        {/* Lista de usuários */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <UserCog className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-slate-600">Nenhum usuário encontrado</p>
              <p className="text-slate-400 text-sm mt-1">Crie o primeiro usuário usando o botão acima</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border bg-white"><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Perfil</TableHead><TableHead>Escopo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
            <TableBody>{usuariosFiltrados.map(u => {
              const perfilCfg = PERFIS[u.perfil] || PERFIS.registradora;
              const PerfilIcon = perfilCfg.icon;
              const isConfirmDelete = deletando === u.id;
              return <TableRow key={u.id}>
                <TableCell><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{u.firstName?.[0] || u.username?.[0]?.toUpperCase() || '?'}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}</p><p className="truncate text-xs text-slate-500">@{u.username} · {u.email}</p></div></div></TableCell>
                <TableCell><Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-700"><PerfilIcon className="h-3 w-3" />{perfilCfg.label}</Badge></TableCell>
                <TableCell><span className="text-xs text-slate-600">{u.uf ? `DETRAN/${u.uf}` : u.perfil === 'sigcr_admin' ? 'Nacional' : 'Empresa vinculada'}</span></TableCell>
                <TableCell><Badge variant="outline" className={u.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>{u.enabled ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                <TableCell className="text-right">{isConfirmDelete ? <div className="flex justify-end gap-1"><Button size="sm" variant="destructive" onClick={() => handleDeletar(u.id, u.username)}>Confirmar exclusão</Button><Button size="sm" variant="ghost" onClick={() => setDeletando(null)}><X className="h-4 w-4" /></Button></div> : <div className="flex justify-end gap-1"><Button size="sm" variant="outline" disabled={alterandoStatus === u.id} onClick={() => handleStatus(u)}>{alterandoStatus === u.id ? 'Salvando...' : u.enabled ? 'Desativar' : 'Ativar'}</Button><Button size="sm" variant="ghost" onClick={() => handleDeletar(u.id, u.username)} className="text-slate-500 hover:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></div>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></CardContent></Card>
        )}

        <p className="text-center text-slate-400 text-xs font-mono">{usuariosFiltrados.length} usuário(s)</p>
          </TabsContent>

          <TabsContent value="pendentes" className="space-y-6 mt-4">
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={fetchCadastrosPendentes}
                className="border-input text-slate-600 hover:text-foreground">
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
            </div>

            {loadingCadastros ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : cadastrosPendentes.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-12 text-center">
                  <ClipboardList className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-slate-600">Nenhum cadastro pendente</p>
                  <p className="text-slate-400 text-sm mt-1">Novos cadastros de empresas aparecerão aqui para aprovação</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-slate-600">Empresa</TableHead>
                        <TableHead className="text-slate-600">CNPJ</TableHead>
                        <TableHead className="text-slate-600">Tipo</TableHead>
                        <TableHead className="text-slate-600">Responsável</TableHead>
                        <TableHead className="text-slate-600">Data do Cadastro</TableHead>
                        <TableHead className="text-slate-600 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cadastrosPendentes.map(c => (
                        <TableRow key={c.company_id} className="border-border">
                          <TableCell className="text-foreground">
                            <div className="font-semibold">{c.nome_fantasia}</div>
                            <div className="text-xs text-slate-500">{c.name}</div>
                            {c.historico_rejeicoes?.length > 0 && (
                              <Badge className="mt-1 bg-red-900/30 text-red-400 border-red-800 text-[10px]">
                                Reenviado após {c.historico_rejeicoes.length}x rejeição
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-600 font-mono text-sm">{c.cnpj}</TableCell>
                          <TableCell>
                            <Badge className="bg-muted text-slate-700 border-input text-xs">
                              {c.tipo_empresa_label || c.tipo_empresa}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-700 text-sm">
                            <div>{c.responsavel?.nome || '—'}</div>
                            <div className="text-xs text-slate-500">{c.responsavel_email_conta || c.email_comercial}</div>
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" disabled={processando === c.company_id} onClick={() => handleAprovar(c)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs">
                                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" /> Aprovar
                              </Button>
                              <Button size="sm" variant="destructive-outline" disabled={processando === c.company_id}
                                onClick={() => { setRejeicaoAlvo(c); setMotivoRejeicao(''); }}>
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

            <p className="text-center text-slate-400 text-xs font-mono">{cadastrosPendentes.length} cadastro(s) pendente(s)</p>
          </TabsContent>
        </Tabs>

        {/* Modal de rejeição */}
        {rejeicaoAlvo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setRejeicaoAlvo(null)} />
            <Card className="relative z-10 w-full max-w-md border-input bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-red-400" /> Rejeitar cadastro
                </CardTitle>
                <p className="text-xs text-slate-500">{rejeicaoAlvo.nome_fantasia} — {rejeicaoAlvo.cnpj}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-slate-600 font-mono mb-1 block">Motivo (opcional)</label>
                  <Textarea
                    value={motivoRejeicao}
                    onChange={e => setMotivoRejeicao(e.target.value)}
                    placeholder="Ex: documento ilegível, CNPJ divergente do contrato social..."
                    className="bg-muted border-input text-foreground placeholder-zinc-600 text-sm min-h-[90px]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">O responsável poderá corrigir os dados e reenviar o cadastro.</p>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="outline" onClick={() => setRejeicaoAlvo(null)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={handleRejeitar} disabled={processando === rejeicaoAlvo.company_id}>
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
