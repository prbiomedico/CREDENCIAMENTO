import {
  LayoutDashboard, Building2, FileText, Search, Bell,
  ChevronRight, Plus, Map, Archive, Landmark, CreditCard,
  Settings, UserCog, FileCheck, Inbox, ListChecks, ScrollText,
} from 'lucide-react';

// Menus por perfil — única fonte de verdade consumida pela sidebar do
// DashboardLayout. A barra horizontal foi removida por duplicar a navegação
// global e competir visualmente com o conteúdo das páginas.
//
// `destaque` é mantido nos dados por compatibilidade; a sidebar continua
// exibindo todos os destinos de forma previsível.
// `/portarias` é o ambiente único "Transparência" (fusão de Portarias +
// Editais, PENDING_ACTIONS.md fatia 3) — abas internas (Portarias/Editais)
// substituem os 2 itens de menu separados que existiam antes. `/editais`
// continua existindo só como redirect (ver App.js), não como item de menu.
export const NAV_REGISTRADORA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard', destaque: true },
  { path: '/solicitacoes',  icon: ChevronRight,    label: 'Minhas Solicitações' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos' },
  { path: '/portarias',     icon: Search,          label: 'Transparência', destaque: true },
  { path: '/fila-registros', icon: Inbox,          label: 'Registro de Contrato' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações', destaque: true },
];

export const NAV_DETRAN = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard', destaque: true },
  { path: '/criar-evento',  icon: Plus,            label: 'Criar Evento' },
  { path: '/mapa',          icon: Map,             label: 'Mapa Nacional' },
  { path: '/portarias',     icon: Search,          label: 'Transparência', destaque: true },
  { path: '/credenciamento/documentos', icon: Archive, label: 'Dossiê Credenciamento' },
  { path: '/detran/conferencia', icon: ListChecks, label: 'Painel de Conferência' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações', destaque: true },
  { path: '/estados',       icon: Landmark,        label: 'Estados',       section: 'DETRANs e Registradoras' },
  { path: '/registradoras', icon: Building2,       label: 'Registradoras', section: 'DETRANs e Registradoras' },
  { path: '/financeiras',   icon: CreditCard,      label: 'Financeiras',   section: 'DETRANs e Registradoras' },
];

export const NAV_FINANCEIRA = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard', destaque: true },
  { path: '/financeiras-empresa', icon: Building2, label: 'Minha Empresa' },
  { path: '/documentos',    icon: FileText,        label: 'Documentos', destaque: true },
  { path: '/registro-contrato', icon: FileCheck,   label: 'Registro de Contrato', destaque: true },
  { path: '/portarias',     icon: Search,          label: 'Transparência' },
  { path: '/credenciamento-portaria', icon: ListChecks, label: 'Credenciamento por Portaria' },
  { path: '/notificacoes',  icon: Bell,            label: 'Notificações', destaque: true },
];

export const NAV_ADMIN_EXTRA = [
  { path: '/credenciamento/documentos', icon: Archive, label: 'Dossiê Credenciamento' },
  { path: '/estados',       icon: Landmark,        label: 'Estados' },
  { path: '/registradoras', icon: Building2,       label: 'Registradoras' },
  { path: '/financeiras',   icon: CreditCard,      label: 'Financeiras' },
  { path: '/detran/conferencia', icon: ListChecks, label: 'Painel de Conferência' },
  { path: '/usuarios',      icon: UserCog,         label: 'Gestão de Usuários' },
  { path: '/auditoria',     icon: ScrollText,      label: 'Auditoria' },
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
//
// `navDestaque`/`navSecundarios` permanecem no retorno por compatibilidade
// com consumidores legados; a navegação oficial usa `navItems` completo.
export function buildNavStructure(perfilAtivo, isAdmin) {
  const todosItens = MENUS[perfilAtivo] || NAV_REGISTRADORA;
  const pathsDoBadge = new Set(todosItens.map((item) => item.path));
  const navAdminExtra = isAdmin ? NAV_ADMIN_EXTRA.filter((item) => !pathsDoBadge.has(item.path)) : [];

  const navItems = todosItens.filter((item) => !item.section);
  const navDestaque = navItems.filter((item) => item.destaque);
  const navSecundarios = navItems.filter((item) => !item.destaque);
  const navSecoes = [];
  todosItens.forEach((item) => {
    if (!item.section) return;
    let grupo = navSecoes.find((g) => g.label === item.section);
    if (!grupo) { grupo = { label: item.section, items: [] }; navSecoes.push(grupo); }
    grupo.items.push(item);
  });

  return { navItems, navDestaque, navSecundarios, navSecoes, navAdminExtra };
}
