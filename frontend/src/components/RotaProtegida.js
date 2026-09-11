import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Envolve uma rota exigindo login e, opcionalmente, um perfil específico.
 * `perfilPermitido` aceita uma string ou array de perfis (registradora, detran,
 * detran_admin, financeira, sigcr_admin). Omitido = qualquer usuário logado.
 * sigcr_admin sempre passa (superusuário), espelhando a regra do backend.
 */
const RotaProtegida = ({ perfilPermitido, children }) => {
  const { user, loading, initialized } = useAuth();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 text-sm font-mono">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const permitidos = Array.isArray(perfilPermitido)
    ? perfilPermitido
    : perfilPermitido ? [perfilPermitido] : null;

  const temPermissao = !permitidos || user.perfil === 'sigcr_admin' || permitidos.includes(user.perfil);

  if (!temPermissao) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default RotaProtegida;
