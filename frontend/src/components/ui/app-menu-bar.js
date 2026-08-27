import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
} from './menubar';

// Substitui a antiga barra de pills (GradientMenu) do Dashboard — mesma
// paridade funcional (navegação + indicação de aba ativa), mas usando o
// primitivo shadcn/Radix Menubar em vez do efeito de glow/gradiente que o
// Pedro achou "muito brega". Itens vêm de navMenus.js, a MESMA fonte usada
// pela sidebar (DashboardLayout) — antes o GradientMenu tinha uma lista fixa
// de 5 itens iguais pra todo perfil, sem relação com a navegação real.
const AppMenuBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { perfilAtivo } = usePerfilAtivo();

  const role = user?.perfil || user?.roles?.[0] || '';
  const isAdmin = role === 'sigcr_admin';
  const { navItems, navSecoes, navAdminExtra } = buildNavStructure(perfilAtivo, isAdmin);

  const isActive = (path) => location.pathname === path;
  const grupoAtivo = (items) => items.some((item) => isActive(item.path));

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

  // Grupos com dropdown: seções nomeadas (ex: "DETRANs e Registradoras") +
  // "Administração" (itens exclusivos de sigcr_admin), mesma composição que
  // a sidebar já monta a partir do mesmo helper.
  const grupos = [
    ...navSecoes,
    ...(navAdminExtra.length > 0 ? [{ label: 'Administração', items: navAdminExtra }] : []),
  ];

  return (
    <Menubar data-testid="app-menu-bar" className="w-full max-w-full overflow-x-auto">
      {navItems.map((item) => {
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

      {grupos.map((grupo) => (
        <MenubarMenu key={grupo.label}>
          <MenubarTrigger
            data-testid={`app-menu-group-${grupo.label}`}
            className={triggerClass(grupoAtivo(grupo.items))}
          >
            {grupo.label}
          </MenubarTrigger>
          <MenubarContent>
            {grupo.items.map((item) => {
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
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  );
};

export default AppMenuBar;
