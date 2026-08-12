import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePerfilAtivo } from '../contexts/PerfilAtivoContext';
import {LayoutDashboard, Building2, FileText, Search, LogOut, Shield,
  Menu, X, Map, Folder, Bell, ChevronRight, Plus,
  ChevronDown, Users, Landmark, CreditCard, Settings, UserCog, Home, Archive,
  FileCheck, Inbox, ListChecks} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Perfis disponveis com suas configs visuais
const PERFIS = {
  registradora: {
    label: 'Registradora',
    color: 'text-orange-400',
    dot: 'bg-orange-400',
    badge: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    icon: Building2,
  },
  detran: {
    label: 'DETRAN',
    color: 'text-blue-400',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    icon: Landmark,
  },
  financeira: {
    label: 'Financeira',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    icon: CreditCard,
  },
};

// Menus por perfil
const NAV_REGISTRADORA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/editais',       icon: Folder,          label: 'Editais Abertos' },
  { path: '/solicitacoes',  icon: ChevronRight,    label: 'Minhas Solicitações' },
  { path: '/empresas',      icon: Building2,       label: 'Empresa' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos' },
  { path: '/portarias',     icon: Search,          label: 'Portarias' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações' },
];

const NAV_DETRAN = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/criar-evento',  icon: Plus,            label: 'Criar Evento' },
  { path: '/editais',       icon: Folder,          label: 'Editais' },
  { path: '/gestao-editais', icon: FileText,       label: 'Gestão de Editais' },
  { path: '/mapa',          icon: Map,             label: 'Mapa Nacional' },
  { path: '/portarias',     icon: Search,          label: 'Portarias' },
  { path: '/credenciamento/documentos', icon: Archive, label: 'Dossiê Credenciamento' },
  { path: '/detran/conferencia', icon: ListChecks, label: 'Painel de Conferência' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações' },
  { path: '/estados',       icon: Landmark,        label: 'Estados',       section: 'DETRANs e Registradoras' },
  { path: '/registradoras', icon: Building2,       label: 'Registradoras', section: 'DETRANs e Registradoras' },
];

const NAV_FINANCEIRA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações' },
];

const NAV_ADMIN_EXTRA = [
  { path: '/credenciamento/documentos', icon: Archive, label: 'Dossiê Credenciamento' },
  { path: '/estados',       icon: Landmark,        label: 'Estados' },
  { path: '/registradoras', icon: Building2,       label: 'Registradoras' },
  { path: '/gestao-editais', icon: FileText,       label: 'Gestão de Editais' },
  { path: '/detran/conferencia', icon: ListChecks, label: 'Painel de Conferência' },
  { path: '/usuarios',      icon: UserCog,         label: 'Gestão de Usuários' },
  { path: '/configuracoes', icon: Settings,        label: 'Configurações' },
];

const MENUS = {
  registradora: NAV_REGISTRADORA,
  detran: NAV_DETRAN,
  financeira: NAV_FINANCEIRA,
};

// Um item de nav (link + estado ativo) — usado tanto pros itens soltos no
// topo do menu quanto pelas seções agrupadas e pelo bloco "Administração",
// que antes tinham essa mesma marcação de link duplicada 3x.
const NavItemLink = ({ item, location, onNavigate }) => {
  const isActive = location.pathname === item.path;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-150 relative group ${
        isActive
          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
      }`}
    >
      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r-full" />}
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{item.label}</span>
      {item.badge > 0 && (
        <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
};

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { perfilAtivo, perfisPermitidos, trocarPerfil } = usePerfilAtivo();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [seletorOpen, setSeletorOpen] = useState(false);
  const seletorRef = useRef(null);

  const role = user?.perfil || user?.roles?.[0] || '';
  const isAdmin = role === 'sigcr_admin';

  // Fecha seletor ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (seletorRef.current && !seletorRef.current.contains(e.target))
        setSeletorOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifCount = async () => {
    try {
      const res = await axios.get(`${API}/notificacoes`, { withCredentials: true });
      const notifs = Array.isArray(res.data) ? res.data : [];
      setNotifCount(notifs.filter(n => !n.lida).length);
    } catch {}
  };

  const handleLogout = () => logout();

  const handleTrocarPerfil = (perfil) => {
    trocarPerfil(perfil);
    setSeletorOpen(false);
    setSidebarOpen(false);
    navigate('/dashboard');
  };

  const cfg = PERFIS[perfilAtivo] || PERFIS.registradora;
  const PerfilIcon = cfg.icon;

  const todosItens = MENUS[perfilAtivo] || NAV_REGISTRADORA;
  // Seção "Administração" só lista o que ainda NÃO aparece no menu do badge
  // ativo (em qualquer sub-seção). NAV_ADMIN_EXTRA e NAV_DETRAN compartilham
  // paths (Dossiê Credenciamento, Estados, Registradoras, Gestão de
  // Editais) — sem esse filtro, um sigcr_admin via cada um deles 2x: uma vez
  // no menu do perfil/badge, outra de novo aqui embaixo, incondicional.
  // Itens exclusivamente administrativos (Gestão de Usuários, Configurações)
  // não colidem com nenhum NAV_* de badge, então sempre aparecem em
  // Administração, badge que for.
  const pathsDoBadge = new Set(todosItens.map((item) => item.path));
  const navAdminExtra = isAdmin ? NAV_ADMIN_EXTRA.filter((item) => !pathsDoBadge.has(item.path)) : [];

  // Itens sem `section` ficam soltos no topo do menu, como sempre. Itens com
  // `section` (ex: "DETRANs e Registradoras") são agrupados por label numa
  // sub-lista própria, mesmo tratamento visual do bloco "Administração"
  // abaixo — permite reaproveitar o mesmo componente de bloco pros dois.
  const navItems = todosItens.filter((item) => !item.section);
  const navSecoes = [];
  todosItens.forEach((item) => {
    if (!item.section) return;
    let grupo = navSecoes.find((g) => g.label === item.section);
    if (!grupo) { grupo = { label: item.section, items: [] }; navSecoes.push(grupo); }
    grupo.items.push(item);
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-zinc-800/50">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <span className="text-base font-heading font-bold block leading-none">sigcr</span>
            <span className="text-xs text-orange-500 font-mono font-bold">SIGCR</span>
          </div>
        </Link>
      </div>

      {/* Seletor de Perfil */}
      <div className="px-3 pt-3 pb-2" ref={seletorRef}>
        <button
          onMouseDown={(e) => { e.stopPropagation(); }} onClick={() => perfisPermitidos.length > 1 && setSeletorOpen(o => !o)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-mono font-semibold uppercase tracking-wider transition-all ${cfg.badge} ${perfisPermitidos.length > 1 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} animate-pulse`} />
          <PerfilIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{cfg.label}</span>
          {perfisPermitidos.length > 1 && (
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${seletorOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Dropdown de troca de perfil */}
        {seletorOpen && perfisPermitidos.length > 1 && (
          <div className="mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
            <p className="text-[10px] text-zinc-500 font-mono uppercase px-3 pt-2 pb-1">Trocar viso</p>
            {perfisPermitidos.map(p => {
              const pc = PERFIS[p];
              const PIcon = pc.icon;
              return (
                <button
                  key={p}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => handleTrocarPerfil(p)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-zinc-800 transition-colors ${p === perfilAtivo ? pc.color + ' font-bold' : 'text-zinc-300'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                  <PIcon className="h-3.5 w-3.5" />
                  {pc.label}
                  {p === perfilAtivo && <span className="ml-auto text-[9px] opacity-60">ATIVO</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItemLink key={item.path} item={item} location={location} onNavigate={() => setSidebarOpen(false)} />
        ))}

        {/* Seções agrupadas (ex: "DETRANs e Registradoras") */}
        {navSecoes.map((secao) => (
          <div key={secao.label} className="pt-2 mt-2 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 font-mono uppercase px-3 pb-1">{secao.label}</p>
            {secao.items.map((item) => (
              <NavItemLink key={item.path} item={item} location={location} onNavigate={() => setSidebarOpen(false)} />
            ))}
          </div>
        ))}

        {/* Separador admin */}
        {navAdminExtra.length > 0 && (
          <div className="pt-2 mt-2 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 font-mono uppercase px-3 pb-1">Administrao</p>
            {navAdminExtra.map((item) => (
              <NavItemLink key={item.path} item={item} location={location} onNavigate={() => setSidebarOpen(false)} />
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-zinc-800/80">
        <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-zinc-900/50">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.picture} alt={user?.name} />
            <AvatarFallback className="bg-orange-500/20 text-orange-400 text-xs font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-none mb-1">{user?.name}</p>
            <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          onClick={handleLogout}
          variant="ghost"
          size="sm"
          className="w-full text-zinc-500 hover:text-white hover:bg-zinc-800 justify-start gap-2 text-xs"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex min-h-0">
      {/* Sidebar desktop */}
      <aside className="fixed lg:static inset-y-0 left-0 z-50 w-64 bg-black/60 backdrop-blur-xl border-r border-zinc-800 transform transition-transform duration-300 lg:translate-x-0 lg:flex flex-col hidden">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-black/90 backdrop-blur-xl border-r border-zinc-800 transform transition-transform duration-300 lg:hidden flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              <span className="font-heading font-bold text-sm">sigcr SIGCR</span>
            </div>
            <Link to="/notificacoes" className="relative">
              <a href="/dashboard" title="Incio" style={{display:"flex",alignItems:"center",justifyContent:"center",width:"36px",height:"36px",borderRadius:"8px",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.6)",marginRight:"8px",textDecoration:"none",fontSize:"18px"}}></a><Bell className="h-5 w-5 text-zinc-400" />
              <a href="/app-mobile" style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 16px", borderRadius:"8px", color:"rgba(255,255,255,0.6)", textDecoration:"none", fontSize:"13px", transition:"all 0.15s" }}>
                 App Mobile
              </a>
              <a href="/documentos/upload" style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 16px", borderRadius:"8px", color:"rgba(255,255,255,0.6)", textDecoration:"none", fontSize:"13px", transition:"all 0.15s" }}>
                 Upload Docs
              </a>
              {notifCount > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{notifCount}</span>}
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
