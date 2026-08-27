import {
  LayoutDashboard, Building2, FileText, Search, Folder, Bell,
  ChevronRight, Plus, Map, Archive, Landmark, CreditCard,
  Settings, UserCog, FileCheck, Inbox, ListChecks,
} from 'lucide-react';

// Menus por perfil — única fonte de verdade, consumida pela sidebar
// (DashboardLayout) e pelo menu superior do Dashboard (AppMenuBar). Extraído
// de DashboardLayout.js pra não duplicar essa lista (e a lógica de seções/
// admin abaixo) em dois lugares.
export const NAV_REGISTRADORA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/editais',       icon: Folder,          label: 'Editais Abertos' },
  { path: '/solicitacoes',  icon: ChevronRight,    label: 'Minhas Solicitações' },
  { path: '/registradoras-empresa', icon: Building2, label: 'Minha Empresa' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos' },
  { path: '/portarias',     icon: Search,          label: 'Portarias' },
  { path: '/fila-registros', icon: Inbox,          label: 'Registro de Contrato' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações' },
];

export const NAV_DETRAN = [
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
  { path: '/financeiras',   icon: CreditCard,      label: 'Financeiras',   section: 'DETRANs e Registradoras' },
];

export const NAV_FINANCEIRA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/financeiras-empresa', icon: Building2, label: 'Minha Empresa' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos' },
  { path: '/registro-contrato', icon: FileCheck,   label: 'Registro de Contrato' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações' },
];

export const NAV_ADMIN_EXTRA = [
  { path: '/credenciamento/documentos', icon: Archive, label: 'Dossiê Credenciamento' },
  { path: '/estados',       icon: Landmark,        label: 'Estados' },
  { path: '/registradoras', icon: Building2,       label: 'Registradoras' },
  { path: '/financeiras',   icon: CreditCard,      label: 'Financeiras' },
  { path: '/gestao-editais', icon: FileText,       label: 'Gestão de Editais' },
  { path: '/detran/conferencia', icon: ListChecks, label: 'Painel de Conferência' },
  { path: '/usuarios',      icon: UserCog,         label: 'Gestão de Usuários' },
  { path: '/configuracoes', icon: Settings,        label: 'Configurações' },
];

export const MENUS = {
  registradora: NAV_REGISTRADORA,
  detran: NAV_DETRAN,
  financeira: NAV_FINANCEIRA,
};

// Deriva { navItems, navSecoes, navAdminExtra } pro perfil/isAdmin atuais —
// mesma lógica de dedupe que já vivia inline em DashboardLayout (seção
// "Administração" só lista o que ainda não aparece no menu do badge ativo).
export function buildNavStructure(perfilAtivo, isAdmin) {
  const todosItens = MENUS[perfilAtivo] || NAV_REGISTRADORA;
  const pathsDoBadge = new Set(todosItens.map((item) => item.path));
  const navAdminExtra = isAdmin ? NAV_ADMIN_EXTRA.filter((item) => !pathsDoBadge.has(item.path)) : [];

  const navItems = todosItens.filter((item) => !item.section);
  const navSecoes = [];
  todosItens.forEach((item) => {
    if (!item.section) return;
    let grupo = navSecoes.find((g) => g.label === item.section);
    if (!grupo) { grupo = { label: item.section, items: [] }; navSecoes.push(grupo); }
    grupo.items.push(item);
  });

  return { navItems, navSecoes, navAdminExtra };
}
