import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import Keycloak from 'keycloak-js';
import axios from 'axios';

const keycloak = new Keycloak({
  url: 'https://auth.sigcr.com.br',
  realm: 'sigcr',
  clientId: 'sigcr-frontend',
});

// Expe keycloak globalmente para que qualquer mdulo acesse o token
window.__kc = keycloak;

// Interceptor global  sempre pega o token mais recente via window.__kc
axios.interceptors.request.use(async (config) => {
  const kc = window.__kc;
  if (kc?.authenticated && kc?.token) {
    try { await kc.updateToken(30); } catch {}
    config.headers.Authorization = `Bearer ${kc.token}`;
  }
  return config;
});

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const refreshRef = useRef(null);

  const extractUser = useCallback((tp) => {
    if (!tp) return null;
    const roles = tp?.realm_access?.roles || [];
    const sigcrRoles = roles.filter(r => ['registradora','detran','detran_admin','sigcr_admin'].includes(r));
    let perfil = 'registradora';
    if (sigcrRoles.includes('sigcr_admin')) perfil = 'sigcr_admin';
    else if (sigcrRoles.includes('detran_admin')) perfil = 'detran_admin';
    else if (sigcrRoles.includes('detran')) perfil = 'detran';
    return {
      user_id: tp.sub,
      email: tp.email || '',
      name: tp.name || tp.preferred_username || '',
      picture: tp.picture || null,
      perfil,
      detran_uf: tp.detran_uf || null,
      roles: sigcrRoles,
    };
  }, []);

  useEffect(() => {
    keycloak.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    }).then(authenticated => {
      if (authenticated) {
        setUser(extractUser(keycloak.tokenParsed));
        refreshRef.current = setInterval(async () => {
          try {
            await keycloak.updateToken(60);
            setUser(extractUser(keycloak.tokenParsed));
          } catch { keycloak.login(); }
        }, 30000);
      }
      setInitialized(true);
      setLoading(false);
    }).catch(() => {
      setInitialized(true);
      setLoading(false);
    });

    keycloak.onTokenExpired = () => keycloak.updateToken(30).catch(() => keycloak.login());
    keycloak.onAuthLogout = () => { setUser(null); clearInterval(refreshRef.current); };

    return () => clearInterval(refreshRef.current);
  }, [extractUser]);

  const login = useCallback(() => keycloak.login({
    redirectUri: window.location.origin + '/dashboard',
    locale: 'pt-BR'
  }), []);

  const logout = useCallback(() => keycloak.logout({ redirectUri: window.location.origin }), []);

  const getToken = useCallback(async () => {
    await keycloak.updateToken(30);
    return keycloak.token;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, initialized, login, logout, getToken, keycloak,
      isDetran: user?.roles?.some(r => ['detran','detran_admin'].includes(r)) ?? false,
      isAdmin: user?.roles?.includes('sigcr_admin') ?? false,
      isRegistradora: user?.roles?.includes('registradora') ?? false,
      setUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
