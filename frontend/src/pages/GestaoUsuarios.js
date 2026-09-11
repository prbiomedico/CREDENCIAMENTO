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
  CreditCard, Trash2, RefreshCw, Check, X, Eye, EyeOff,
  ClipboardList, ThumbsUp, ThumbsDown, Users, UserCheck, UserX,
  Pencil, KeyRound, LogOut, Download, History, Smartphone, ShieldCheck
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
  { value: 'registradora',  label: 'Registradora',    desc: 'Acesso ao módulo de credenciamento e documentos', icon: Building2,  color: 'primary' },
  { value: 'detran',        label: 'Operador DETRAN',  desc: 'Acesso ao painel DETRAN e gestão de editais',     icon: Landmark,   color: 'primary' },
  { value: 'detran_admin',  label: 'Admin DETRAN',     desc: 'Acesso total ao módulo DETRAN e configurações',   icon: Landmark,   color: 'primary' },
  { value: 'financeira',    label: 'Financeira',       desc: 'Acesso a contratos e gravames',                   icon: CreditCard, color: 'emerald' },
  { value: 'sigcr_admin',   label: 'Admin SIGCR',      desc: 'Acesso total ao sistema e a todas as camadas',    icon: Shield,     color: 'primary' },
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
  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [senhaAlvo, setSenhaAlvo] = useState(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [senhaTemporaria, setSenhaTemporaria] = useState(true);
  const [redefinindoSenha, setRedefinindoSenha] = useState(false);
  const [encerrandoSessoes, setEncerrandoSessoes] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [detalhesAlvo, setDetalhesAlvo] = useState(null);
  const [historicoUsuario, setHistoricoUsuario] = useState([]);
  const [sessoesUsuario, setSessoesUsuario] = useState([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [exigindoMfa, setExigindoMfa] = useState(null);

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
    if (form.password.length < 8) {
      toast({ title: 'A senha deve ter no mínimo 8 caracteres', variant: 'destructive' });
      return;
    }
    if (['detran', 'detran_admin'].includes(form.role) && !form.uf) {
      toast({ title: 'Informe a UF do DETRAN', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/admin/usuarios`, form, { withCredentials: true });
      toast({ title: 'Usuário criado com sucesso', description: `${form.email} · perfil: ${PERFIS[form.role]?.label}` });
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

  const abrirEdicao = (usuario) => {
    setEditando(usuario);
    setEditForm({
      username: usuario.username || '', email: usuario.email || '',
      firstName: usuario.firstName || '', lastName: usuario.lastName || '',
      role: usuario.perfil || 'registradora', uf: usuario.uf || '',
    });
  };

  const handleEditar = async () => {
    if (!editando || !editForm?.username || !editForm?.email || !editForm?.role) return;
    if (['detran', 'detran_admin'].includes(editForm.role) && !editForm.uf) {
      toast({ title: 'Informe a UF do DETRAN', variant: 'destructive' });
      return;
    }
    setSalvandoEdicao(true);
    try {
      await axios.patch(`${API}/admin/usuarios/${editando.id}`, editForm, { withCredentials: true });
      toast({ title: 'Usuário atualizado', description: 'As sessões anteriores foram encerradas por segurança.' });
      setEditando(null);
      setEditForm(null);
      await fetchUsuarios();
    } catch (e) {
      toast({ title: 'Não foi possível atualizar', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleRedefinirSenha = async () => {
    if (!senhaAlvo || novaSenha.length < 8) {
      toast({ title: 'A senha deve ter no mínimo 8 caracteres', variant: 'destructive' });
      return;
    }
    setRedefinindoSenha(true);
    try {
      await axios.post(`${API}/admin/usuarios/${senhaAlvo.id}/redefinir-senha`, { password: novaSenha, temporary: senhaTemporaria }, { withCredentials: true });
      toast({ title: 'Senha redefinida', description: senhaTemporaria ? 'O usuário deverá alterá-la no próximo acesso.' : 'A nova senha já está ativa.' });
      setSenhaAlvo(null);
      setNovaSenha('');
      setSenhaTemporaria(true);
    } catch (e) {
      toast({ title: 'Não foi possível redefinir a senha', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setRedefinindoSenha(false);
    }
  };

  const handleEncerrarSessoes = async (usuario) => {
    setEncerrandoSessoes(usuario.id);
    try {
      await axios.post(`${API}/admin/usuarios/${usuario.id}/encerrar-sessoes`, {}, { withCredentials: true });
      toast({ title: 'Sessões encerradas', description: `${usuario.email} precisará entrar novamente.` });
    } catch (e) {
      toast({ title: 'Não foi possível encerrar as sessões', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setEncerrandoSessoes(null);
    }
  };

  const abrirDetalhes = async (usuario) => {
    setDetalhesAlvo(usuario);
    setLoadingDetalhes(true);
    try {
      const [historico, sessoes] = await Promise.all([
        axios.get(`${API}/admin/usuarios/${usuario.id}/historico`, { withCredentials: true }),
        axios.get(`${API}/admin/usuarios/${usuario.id}/sessoes`, { withCredentials: true }),
      ]);
      setHistoricoUsuario(Array.isArray(historico.data) ? historico.data : []);
      setSessoesUsuario(Array.isArray(sessoes.data) ? sessoes.data : []);
    } catch (e) {
      toast({ title: 'Não foi possível carregar os detalhes', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const handleExigirMfa = async (usuario) => {
    setExigindoMfa(usuario.id);
    try {
      await axios.post(`${API}/admin/usuarios/${usuario.id}/exigir-mfa`, {}, { withCredentials: true });
      toast({ title: 'MFA obrigatório', description: `${usuario.email} configurará o autenticador no próximo acesso.` });
    } catch (e) {
      toast({ title: 'Não foi possível exigir MFA', description: e.response?.data?.detail || 'Tente novamente', variant: 'destructive' });
    } finally {
      setExigindoMfa(null);
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
  const ITENS_POR_PAGINA = 20;
  const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const usuariosPaginados = usuariosFiltrados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  useEffect(() => { setPagina(1); }, [busca, filtroPerfil, filtroStatus]);

  const exportarUsuarios = () => {
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const linhas = [['Usuário', 'E-mail', 'Nome', 'Perfil', 'UF', 'Status', 'Criado em'], ...usuariosFiltrados.map(u => [
      u.username, u.email, [u.firstName, u.lastName].filter(Boolean).join(' '),
      PERFIS[u.perfil]?.label || u.perfil, u.uf || '', u.enabled ? 'Ativo' : 'Inativo', u.created_at || '',
    ])];
    const blob = new Blob([`\uFEFF${linhas.map(linha => linha.map(escape).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios-sigcr-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          <Button variant="outline" size="sm" onClick={exportarUsuarios} disabled={!usuariosFiltrados.length}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
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
            <TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Perfil</TableHead><TableHead>Escopo</TableHead><TableHead>Criado em</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{usuariosPaginados.map(u => {
              const perfilCfg = PERFIS[u.perfil] || PERFIS.registradora;
              const PerfilIcon = perfilCfg.icon;
              const isConfirmDelete = deletando === u.id;
              return <TableRow key={u.id}>
                <TableCell><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{u.firstName?.[0] || u.username?.[0]?.toUpperCase() || '?'}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}</p><p className="truncate text-xs text-slate-500">@{u.username} · {u.email}</p></div></div></TableCell>
                <TableCell><Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-slate-700"><PerfilIcon className="h-3 w-3" />{perfilCfg.label}</Badge></TableCell>
                <TableCell><span className="text-xs text-slate-600">{u.uf ? `DETRAN/${u.uf}` : u.perfil === 'sigcr_admin' ? 'Nacional' : 'Empresa vinculada'}</span></TableCell>
                <TableCell><span className="text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—'}</span></TableCell>
                <TableCell><Badge variant="outline" className={u.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>{u.enabled ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                <TableCell className="text-right">{isConfirmDelete ? <div className="flex justify-end gap-1"><Button size="sm" variant="destructive" onClick={() => handleDeletar(u.id, u.username)}>Confirmar exclusão</Button><Button size="sm" variant="ghost" onClick={() => setDeletando(null)}><X className="h-4 w-4" /></Button></div> : <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Histórico e sessões" aria-label={`Histórico e sessões de ${u.username}`} onClick={() => abrirDetalhes(u)}><History className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Exigir MFA" aria-label={`Exigir MFA de ${u.username}`} disabled={exigindoMfa === u.id} onClick={() => handleExigirMfa(u)}><ShieldCheck className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Editar usuário" aria-label={`Editar ${u.username}`} onClick={() => abrirEdicao(u)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Redefinir senha" aria-label={`Redefinir senha de ${u.username}`} onClick={() => setSenhaAlvo(u)}><KeyRound className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Encerrar sessões" aria-label={`Encerrar sessões de ${u.username}`} disabled={encerrandoSessoes === u.id} onClick={() => handleEncerrarSessoes(u)}><LogOut className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={alterandoStatus === u.id} onClick={() => handleStatus(u)}>{alterandoStatus === u.id ? 'Salvando...' : u.enabled ? 'Desativar' : 'Ativar'}</Button><Button size="icon" variant="ghost" aria-label={`Excluir ${u.username}`} onClick={() => handleDeletar(u.id, u.username)} className="text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button></div>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></CardContent></Card>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500"><span>{usuariosFiltrados.length} usuário(s)</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={paginaAtual === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Button><span>Página {paginaAtual} de {totalPaginas}</span><Button size="sm" variant="outline" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Próxima</Button></div></div>
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

        {editando && editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Editar usuário">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setEditando(null)} />
            <Card className="relative z-10 w-full max-w-2xl border-slate-200 bg-white shadow-2xl">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Pencil className="h-4 w-4" />Editar usuário</CardTitle><p className="text-sm text-slate-500">Identidade, perfil e escopo. A alteração encerra as sessões atuais.</p></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[['username','Usuário'],['email','E-mail'],['firstName','Nome'],['lastName','Sobrenome']].map(([key, label]) => <label key={key} className="space-y-1 text-xs font-medium text-slate-600"><span>{label}</span><input aria-label={label} value={editForm[key]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900" /></label>)}
                  <label className="space-y-1 text-xs font-medium text-slate-600"><span>Perfil</span><select aria-label="Perfil" value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value, uf: ['detran','detran_admin'].includes(e.target.value) ? p.uf : '' }))} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900">{TODAS_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                  {['detran','detran_admin'].includes(editForm.role) && <label className="space-y-1 text-xs font-medium text-slate-600"><span>UF do DETRAN</span><select aria-label="UF do DETRAN" value={editForm.uf} onChange={e => setEditForm(p => ({ ...p, uf: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900"><option value="">Selecione</option>{UFS.map(uf => <option key={uf}>{uf}</option>)}</select></label>}
                </div>
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button><Button onClick={handleEditar} disabled={salvandoEdicao}>{salvandoEdicao ? 'Salvando...' : 'Salvar alterações'}</Button></div>
              </CardContent>
            </Card>
          </div>
        )}

        {senhaAlvo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Redefinir senha">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setSenhaAlvo(null)} />
            <Card className="relative z-10 w-full max-w-md border-slate-200 bg-white shadow-2xl">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-4 w-4" />Redefinir senha</CardTitle><p className="text-sm text-slate-500">{senhaAlvo.email}</p></CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-1 text-xs font-medium text-slate-600"><span>Nova senha</span><input aria-label="Nova senha" type="password" minLength={8} value={novaSenha} onChange={e => setNovaSenha(e.target.value)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900" placeholder="Mínimo de 8 caracteres" /></label>
                <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={senhaTemporaria} onChange={e => setSenhaTemporaria(e.target.checked)} className="mt-1" /><span>Exigir alteração no próximo acesso<span className="block text-xs text-slate-500">As sessões atuais serão encerradas.</span></span></label>
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSenhaAlvo(null)}>Cancelar</Button><Button onClick={handleRedefinirSenha} disabled={redefinindoSenha}>{redefinindoSenha ? 'Redefinindo...' : 'Redefinir senha'}</Button></div>
              </CardContent>
            </Card>
          </div>
        )}

        {detalhesAlvo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Histórico e sessões">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setDetalhesAlvo(null)} />
            <Card className="relative z-10 max-h-[85vh] w-full max-w-3xl overflow-auto border-slate-200 bg-white shadow-2xl">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-4 w-4" />Histórico e sessões</CardTitle><p className="text-sm text-slate-500">{detalhesAlvo.email}</p></CardHeader>
              <CardContent className="space-y-6">
                {loadingDetalhes ? <p className="py-8 text-center text-sm text-slate-500">Carregando detalhes...</p> : <>
                  <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4" />Sessões ativas ({sessoesUsuario.length})</h3>{sessoesUsuario.length ? <div className="divide-y rounded-md border">{sessoesUsuario.map(sessao => <div key={sessao.id} className="flex items-center justify-between gap-4 p-3 text-xs"><div><p className="font-medium text-slate-800">{sessao.ip_address || 'IP não informado'}</p><p className="text-slate-500">{sessao.clientes?.join(', ') || 'Cliente não informado'}</p></div><p className="text-slate-500">Último acesso: {sessao.ultimo_acesso ? new Date(sessao.ultimo_acesso).toLocaleString('pt-BR') : '—'}</p></div>)}</div> : <p className="rounded-md border border-dashed p-4 text-sm text-slate-500">Nenhuma sessão ativa.</p>}</section>
                  <section><h3 className="mb-2 text-sm font-semibold">Últimas operações ({historicoUsuario.length})</h3>{historicoUsuario.length ? <div className="divide-y rounded-md border">{historicoUsuario.map(log => <div key={log.log_id} className="flex items-start justify-between gap-4 p-3 text-xs"><div><p className="font-medium text-slate-800">{String(log.acao || '').replaceAll('_', ' ')}</p><p className="text-slate-500">por {log.user_name || log.user_email || 'Sistema'}</p></div><time className="whitespace-nowrap text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : '—'}</time></div>)}</div> : <p className="rounded-md border border-dashed p-4 text-sm text-slate-500">Nenhuma operação registrada.</p>}</section>
                </>}
                <div className="flex justify-end"><Button variant="outline" onClick={() => setDetalhesAlvo(null)}>Fechar</Button></div>
              </CardContent>
            </Card>
          </div>
        )}

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
