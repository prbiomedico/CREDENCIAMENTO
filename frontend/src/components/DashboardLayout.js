import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePerfilAtivo } from '../contexts/PerfilAtivoContext';
import { useViewContext } from '../contexts/ViewContext';
import {Building2, FileText, Search, LogOut, Shield,
  Menu, X, Bell, ChevronDown, Landmark, CreditCard} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildNavStructure } from '../config/navMenus';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Perfis disponveis com suas configs visuais
const PERFIS = {
  registradora: {
    label: 'Registradora',
    color: 'text-primary-400',
    dot: 'bg-primary-400',
    badge: 'bg-primary-500/10 border-primary-500/30 text-primary-400',
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

// UFs pro seletor de simulação "ver como DETRAN de <UF>" do sigcr_admin —
// mesma lista usada em GestaoUsuarios.js/Editais.js/CriarEvento.js etc.
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Perfil do badge -> tipo_empresa correspondente, pra buscar candidatos reais
// de "ver como empresa". 'detran' não entra aqui (usa UFS acima, não empresa).
const TIPO_EMPRESA_POR_PERFIL = { registradora: 'registradora', financeira: 'financeira' };

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
          ? 'bg-primary-500/15 text-primary-400 border border-primary-500/25 shadow-[0_0_16px_-6px_hsl(var(--primary)/0.5)]'
          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
      }`}
    >
      {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-500 rounded-r-full" />}
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="text-sm">{item.label}</span>
      {item.badge > 0 && (
        <span className="ml-auto bg-primary-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
};

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { perfilAtivo, perfisPermitidos, trocarPerfil } = usePerfilAtivo();
  const { viewingAs, verComoEmpresa, verComoDetran, sair } = useViewContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [seletorOpen, setSeletorOpen] = useState(false);
  const [empresasSimulacao, setEmpresasSimulacao] = useState([]);
  const seletorRef = useRef(null);

  const role = user?.perfil || user?.roles?.[0] || '';
  const isAdmin = role === 'sigcr_admin';

  // "Trocar Visão" (só sigcr_admin): o badge sozinho só diz o TIPO de perfil
  // (registradora/detran/financeira), não uma empresa/UF específica — então
  // a simulação real (view_as_company_id/view_as_detran_uf, injetada pelo
  // interceptor global em AuthContext.js) precisa de um alvo explícito,
  // escolhido no seletor abaixo. Ao trocar de tipo de badge, uma simulação
  // ativa que não é mais do tipo certo é encerrada — nunca deixa, por
  // exemplo, "ver como HD Registros" grudado depois de trocar pro badge
  // DETRAN, o que mostraria dados errados sem nenhum aviso.
  useEffect(() => {
    if (!isAdmin) return;
    const tipoEmpresa = TIPO_EMPRESA_POR_PERFIL[perfilAtivo];
    const tipoEsperado = perfilAtivo === 'detran' ? 'detran' : (tipoEmpresa ? 'empresa' : null);
    if (viewingAs && viewingAs.tipo !== tipoEsperado) {
      // window.__viewContext é escrito direto (além de sair()) pra garantir
      // que a busca de candidatos abaixo, no mesmo tick, já não carregue o
      // view_as_company_id antigo — sair() só reflete no interceptor depois
      // do próximo ciclo de render do ViewProvider.
      window.__viewContext.viewingAs = null;
      sair();
    }
    if (!tipoEmpresa) { setEmpresasSimulacao([]); return; }
    let cancelado = false;
    axios.get(`${API}/companies`, { params: { tipo_empresa: tipoEmpresa }, withCredentials: true })
      .then(res => { if (!cancelado) setEmpresasSimulacao(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelado) setEmpresasSimulacao([]); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, perfilAtivo]);

  const handleSimularEmpresa = (e) => {
    const id = e.target.value;
    if (!id) { sair(); return; }
    const empresa = empresasSimulacao.find(c => c.company_id === id);
    verComoEmpresa(id, empresa?.nome_fantasia || empresa?.name || id);
  };

  const handleSimularDetran = (e) => {
    const uf = e.target.value;
    if (!uf) { sair(); return; }
    verComoDetran(uf, uf);
  };

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

  // Deriva os itens/seções/admin-extra pro perfil ativo — lógica
  // centralizada em navMenus.js pra ser reaproveitada pelo AppMenuBar do
  // Dashboard sem duplicar as regras de dedupe (ver comentário lá).
  const { navItems, navSecoes, navAdminExtra } = buildNavStructure(perfilAtivo, isAdmin);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-zinc-800/50 glow-brand">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-500/10 border border-primary-500/20 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <span className="text-base font-heading font-bold block leading-none">sigcr</span>
            <span className="text-xs text-primary-500 font-mono font-bold">SIGCR</span>
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
          <div className="mt-1 bg-zinc-900 rounded-lg overflow-hidden z-50 elevate-3">
            <p className="text-[10px] text-zinc-500 font-mono uppercase px-3 pt-2 pb-1">Trocar visão</p>
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

        {/* Simulação real de "ver como" (sigcr_admin) — liga o badge acima ao
            view_as_company_id/view_as_detran_uf de verdade no backend, em vez
            de só trocar o menu local. Sem escolher um alvo aqui, o admin
            continua com a visão irrestrita de sempre. */}
        {isAdmin && (
          <div className="mt-1">
            {perfilAtivo === 'detran' ? (
              <select
                value={viewingAs?.tipo === 'detran' ? viewingAs.id : ''}
                onChange={handleSimularDetran}
                data-testid="view-as-detran-select"
                className="w-full text-[11px] font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300"
              >
                <option value="">Visão irrestrita (sem simulação)</option>
                {UFS.map(uf => <option key={uf} value={uf}>Simular DETRAN {uf}</option>)}
              </select>
            ) : (
              <select
                value={viewingAs?.tipo === 'empresa' ? viewingAs.id : ''}
                onChange={handleSimularEmpresa}
                data-testid="view-as-empresa-select"
                className="w-full text-[11px] font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300"
              >
                <option value="">Visão irrestrita (sem simulação)</option>
                {empresasSimulacao.map(c => (
                  <option key={c.company_id} value={c.company_id}>Simular {c.nome_fantasia || c.name}</option>
                ))}
              </select>
            )}
            {viewingAs && (
              <p className="text-[10px] text-amber-400 font-mono mt-1 px-0.5">
                ● Vendo exatamente como {viewingAs.tipo === 'detran' ? `DETRAN ${viewingAs.id}` : viewingAs.nome}
              </p>
            )}
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
            <p className="text-[10px] text-zinc-600 font-mono uppercase px-3 pb-1">Administração</p>
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
            <AvatarFallback className="bg-primary-500/20 text-primary-400 text-xs font-bold">
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
          data-testid="logout-btn"
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
      <aside className="fixed lg:static inset-y-0 left-0 z-50 w-64 bg-black/60 backdrop-blur-xl border-r border-zinc-800 transform transition-transform duration-300 lg:translate-x-0 lg:flex flex-col hidden elevate-2">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-black/90 backdrop-blur-xl border-r border-zinc-800 transform transition-transform duration-300 lg:hidden flex flex-col elevate-2 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-zinc-800 px-4 py-3 glow-brand">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary-500" />
              <span className="font-heading font-bold text-sm">sigcr SIGCR</span>
            </div>
            <Link to="/notificacoes" data-testid="mobile-notif-link" className="relative">
              <Bell className="h-5 w-5 text-zinc-400" />
              {notifCount > 0 && <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{notifCount}</span>}
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
