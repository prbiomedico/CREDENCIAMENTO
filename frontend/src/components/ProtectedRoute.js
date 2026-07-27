import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const { user, loading, initialized, login } = useAuth();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 text-sm font-mono">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    login();
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="h-10 w-10 text-orange-500 mx-auto" />
          <p className="text-zinc-400 text-sm">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
