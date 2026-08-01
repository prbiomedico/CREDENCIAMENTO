import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

/**
 * Modo "ver como" — só sigcr_admin. Permite navegar/agir vendo o sistema
 * como uma empresa específica ou como o DETRAN de uma UF específica, sem
 * trocar de login. `window.__viewContext` é lido pelo interceptor axios
 * (registrado em AuthContext.js, fora do ciclo de render do React) — por
 * isso o valor é espelhado nele a cada mudança, em vez de só viver no
 * estado do React.
 */

const ViewContext = createContext(null);

export const useViewContext = () => {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useViewContext fora do ViewProvider');
  return ctx;
};

export const ViewProvider = ({ children }) => {
  const { isAdmin } = useAuth();
  const [viewingAs, setViewingAsState] = useState(null);

  useEffect(() => {
    window.__viewContext.viewingAs = isAdmin ? viewingAs : null;
  }, [viewingAs, isAdmin]);

  // Se por algum motivo o usuário deixar de ser admin (logout, troca de
  // conta) enquanto o modo estava ativo, encerra — nunca deixa um perfil
  // sem privilégio herdar um viewingAs de uma sessão anterior.
  useEffect(() => {
    if (!isAdmin && viewingAs) setViewingAsState(null);
  }, [isAdmin, viewingAs]);

  const verComoEmpresa = useCallback((id, nome) => {
    if (!isAdmin) return;
    setViewingAsState({ tipo: 'empresa', id, nome });
  }, [isAdmin]);

  const verComoDetran = useCallback((id, nome) => {
    if (!isAdmin) return;
    setViewingAsState({ tipo: 'detran', id, nome });
  }, [isAdmin]);

  const sair = useCallback(() => setViewingAsState(null), []);

  return (
    <ViewContext.Provider value={{ viewingAs, verComoEmpresa, verComoDetran, sair, isAdmin }}>
      {children}
    </ViewContext.Provider>
  );
};

export default ViewProvider;
