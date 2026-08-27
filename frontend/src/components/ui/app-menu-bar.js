import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePerfilAtivo } from '../../contexts/PerfilAtivoContext';
import { buildNavStructure } from '../../config/navMenus';
import { cn } from '@/lib/utils';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from './menubar';

// Substitui a antiga barra de pills (GradientMenu) do Dashboard — mesma
// paridade funcional (navegação + indicação de aba ativa), mas usando o
// primitivo shadcn/Radix Menubar em vez do efeito de glow/gradiente que o
// Pedro achou "muito brega". Itens vêm de navMenus.js, a MESMA fonte usada
// pela sidebar (DashboardLayout) — antes o GradientMenu tinha uma lista fixa
// de 5 itens iguais pra todo perfil, sem relação com a navegação real.
//
// A sidebar (sempre visível no desktop, DashboardLayout) já lista TODOS os
// itens de navegação — esta barra é um atalho secundário sobre o Dashboard,
// não uma segunda cópia completa do menu. Por isso só os itens marcados
// `destaque` em navMenus.js ficam soltos na linha; o resto (itens
// secundários + seções + "Administração") fica atrás do trigger "Mais",
// evitando o scroll horizontal cortando item que a lista completa causava.
const AppMenuBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perfilAtivo } = usePerfilAtivo();

  const role = user?.perfil || user?.roles?.[0] || '';
  const isAdmin = role === 'sigcr_admin';
  const { navDestaque, navSecundarios, navSecoes, navAdminExtra } = buildNavStructure(perfilAtivo, isAdmin);

  const isActive = (path) => location.pathname === path;
  const grupoAtivo = (items) => items.some((item) => isActive(item.path));
  const maisAtivo =
    grupoAtivo(navSecundarios) ||
    navSecoes.some((secao) => grupoAtivo(secao.items)) ||
    grupoAtivo(navAdminExtra);

  const triggerClass = (active) =>
    cn(
      'flex shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium outline-none transition-colors',
      active
        ? 'bg-primary-500/15 text-primary-400'
        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-white focus:bg-zinc-800/70 focus:text-white data-[state=open]:bg-zinc-800/70 data-[state=open]:text-white'
    );

  const itemClass = (active) =>
    cn(
      'flex items-center gap-2 cursor-pointer',
      active
        ? 'bg-primary-500/15 text-primary-400 focus:bg-primary-500/15 focus:text-primary-400'
        : 'focus:bg-zinc-800 focus:text-white'
    );

  const subTriggerClass = (active) =>
    cn(
      active
        ? 'bg-primary-500/15 text-primary-400 focus:bg-primary-500/15 focus:text-primary-400 data-[state=open]:bg-primary-500/15 data-[state=open]:text-primary-400'
        : 'focus:bg-zinc-800 focus:text-white data-[state=open]:bg-zinc-800 data-[state=open]:text-white'
    );

  const temMais = navSecundarios.length > 0 || navSecoes.length > 0 || navAdminExtra.length > 0;

  return (
    <Menubar data-testid="app-menu-bar" className="w-full max-w-full overflow-x-auto">
      {navDestaque.map((item) => {
        const Icon = item.icon;
        return (
          <MenubarMenu key={item.path}>
            <MenubarTrigger
              data-testid={`app-menu-item-${item.path.replace(/\//g, '-')}`}
              onClick={() => navigate(item.path)}
              className={triggerClass(isActive(item.path))}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </MenubarTrigger>
          </MenubarMenu>
        );
      })}

      {temMais && (
        <MenubarMenu>
          <MenubarTrigger data-testid="app-menu-mais" className={triggerClass(maisAtivo)}>
            <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
            Mais
          </MenubarTrigger>
          <MenubarContent>
            {navSecundarios.map((item) => {
              const Icon = item.icon;
              return (
                <MenubarItem
                  key={item.path}
                  data-testid={`app-menu-item-${item.path.replace(/\//g, '-')}`}
                  onClick={() => navigate(item.path)}
                  className={itemClass(isActive(item.path))}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </MenubarItem>
              );
            })}

            {navSecundarios.length > 0 && (navSecoes.length > 0 || navAdminExtra.length > 0) && (
              <MenubarSeparator />
            )}

            {navSecoes.map((secao) => (
              <MenubarSub key={secao.label}>
                <MenubarSubTrigger
                  data-testid={`app-menu-group-${secao.label}`}
                  className={subTriggerClass(grupoAtivo(secao.items))}
                >
                  {secao.label}
                </MenubarSubTrigger>
                <MenubarSubContent>
                  {secao.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <MenubarItem
                        key={item.path}
                        data-testid={`app-menu-item-${item.path.replace(/\//g, '-')}`}
                        onClick={() => navigate(item.path)}
                        className={itemClass(isActive(item.path))}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </MenubarItem>
                    );
                  })}
                </MenubarSubContent>
              </MenubarSub>
            ))}

            {navAdminExtra.length > 0 && (
              <MenubarSub>
                <MenubarSubTrigger
                  data-testid="app-menu-group-Administração"
                  className={subTriggerClass(grupoAtivo(navAdminExtra))}
                >
                  Administração
                </MenubarSubTrigger>
                <MenubarSubContent>
                  {navAdminExtra.map((item) => {
                    const Icon = item.icon;
                    return (
                      <MenubarItem
                        key={item.path}
                        data-testid={`app-menu-item-${item.path.replace(/\//g, '-')}`}
                        onClick={() => navigate(item.path)}
                        className={itemClass(isActive(item.path))}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </MenubarItem>
                    );
                  })}
                </MenubarSubContent>
              </MenubarSub>
            )}
          </MenubarContent>
        </MenubarMenu>
      )}
    </Menubar>
  );
};

export default AppMenuBar;
