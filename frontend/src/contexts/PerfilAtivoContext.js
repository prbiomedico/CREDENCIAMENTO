import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Perfis que cada role pode acessar via badge (hierarquia LGPD) — única fonte
// de verdade, consumida tanto pelo seletor de perfil (DashboardLayout) quanto
// por qualquer tela que precise filtrar dados (ex: "Selecionar Empresa") pelo
// segmento atualmente ativo.
export const PERFIS_PERMITIDOS = {
  sigcr_admin:      ['registradora', 'detran', 'financeira'],
  detran_admin:     ['detran', 'registradora'],
  detran_operator:  ['detran'],
  registradora_user:['registradora'],
  financeira_user:  ['financeira'],
};

function perfilInicial(user) {
  const stored = localStorage.getItem('sigcr_perfil_ativo');
  const role = user?.perfil || user?.roles?.[0] || '';
  const permitidos = PERFIS_PERMITIDOS[role] || ['registradora'];
  if (stored && permitidos.includes(stored)) return stored;
  if (role.includes('detran')) return 'detran';
  if (role.includes('financeira')) return 'financeira';
  return 'registradora';
}

const PerfilAtivoContext = createContext(null);

// Badge de perfil (Registradora/DETRAN/Financeira) — antes vivia como estado
// local do DashboardLayout e só trocava o menu lateral; qualquer tela que
// precisasse filtrar dados pelo perfil ativo (ex: Documentos "Selecionar
// Empresa") não tinha acesso a esse valor. Centralizado aqui pra ficar
// acessível em toda a árvore autenticada.
export const PerfilAtivoProvider = ({ children }) => {
  const { user } = useAuth();
  const [perfilAtivo, setPerfilAtivoState] = useState(() => perfilInicial(user));

  const role = user?.perfil || user?.roles?.[0] || '';
  const perfisPermitidos = PERFIS_PERMITIDOS[role] || ['registradora'];

  // O provider é montado antes do AuthContext resolver o usuário (fica acima
  // das rotas públicas também), então o valor inicial pode ter sido calculado
  // com user=null. Reajusta assim que o usuário real chegar, ou se o role
  // mudar e o perfil atual deixar de ser permitido.
  useEffect(() => {
    if (!user) return;
    if (!perfisPermitidos.includes(perfilAtivo)) {
      setPerfilAtivoState(perfilInicial(user));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const trocarPerfil = (perfil) => {
    setPerfilAtivoState(perfil);
    localStorage.setItem('sigcr_perfil_ativo', perfil);
  };

  return (
    <PerfilAtivoContext.Provider value={{ perfilAtivo, perfisPermitidos, trocarPerfil }}>
      {children}
    </PerfilAtivoContext.Provider>
  );
};

export const usePerfilAtivo = () => {
  const ctx = useContext(PerfilAtivoContext);
  if (!ctx) throw new Error('usePerfilAtivo deve ser usado dentro de PerfilAtivoProvider');
  return ctx;
};
