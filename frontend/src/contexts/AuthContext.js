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

// Promise que só resolve depois que keycloak.init() terminar (sucesso ou
// falha) — usada pelo interceptor abaixo pra nunca deixar uma requisição
// sair sem esperar o Keycloak "assentar" primeiro. Antes disso, uma chamada
// feita nesse meio-tempo (ex: componente montando antes do check-sso
// terminar) saía sem Authorization e o backend respondia 401 — a causa raiz
// do bug "Nenhuma empresa cadastrada"/"Erro ao cadastrar empresa".
let _resolveKcReady;
window.__kcReady = new Promise((resolve) => { _resolveKcReady = resolve; });

// Interceptor global  sempre pega o token mais recente via window.__kc
axios.interceptors.request.use(async (config) => {
  await window.__kcReady;
  const kc = window.__kc;
  if (kc?.authenticated && kc?.token) {
    try {
      await kc.updateToken(30);
    } catch {
      // refresh_token não renovou (sessão do Keycloak realmente expirou,
      // ex: SSO Session Idle) — não faz sentido mandar a requisição com um
      // access token que já sabemos estar morto, só pra render um 401 feio
      // em cada tela. Manda direto pro re-login, igual o setInterval/
      // onTokenExpired já fazem — antes disso, essa falha era engolida
      // silenciosamente e cada página tratava o 401 resultante do seu
      // próprio jeito (ex: banner "Sessão expirada" em Empresas.js).
      kc.login();
      return new Promise(() => {}); // nunca resolve; a navegação já saiu da página
    }
    config.headers.Authorization = `Bearer ${kc.token}`;
  }
  return config;
});

// Estado do modo "ver como" (sigcr_admin) — inicializado aqui, não em
// ViewContext.js, pra nunca depender de qual módulo importa primeiro; o
// ViewProvider só escreve neste objeto, nunca o recria.
window.__viewContext = { viewingAs: null };

// Segundo interceptor: injeta o parâmetro de escopo quando o admin está
// "vendo como" uma empresa/DETRAN. Usa query param (config.params) em vez de
// mexer no body/FormData — isso funciona igual em GET/POST/PATCH/DELETE e em
// uploads multipart sem precisar de tratamento especial pro FormData, já que
// query string é sempre independente do conteúdo de config.data.
axios.interceptors.request.use((config) => {
  const viewingAs = window.__viewContext?.viewingAs;
  if (viewingAs) {
    config.params = { ...config.params };
    if (viewingAs.tipo === 'empresa') config.params.view_as_company_id = viewingAs.id;
    else if (viewingAs.tipo === 'detran') config.params.view_as_detran_uf = viewingAs.id;
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
    const sigcrRoles = roles.filter(r => ['registradora','detran','detran_admin','financeira','sigcr_admin'].includes(r));
    let perfil = 'registradora';
    if (sigcrRoles.includes('sigcr_admin')) perfil = 'sigcr_admin';
    else if (sigcrRoles.includes('detran_admin')) perfil = 'detran_admin';
    else if (sigcrRoles.includes('detran')) perfil = 'detran';
    else if (sigcrRoles.includes('financeira')) perfil = 'financeira';
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
      _resolveKcReady();
    }).catch(() => {
      setInitialized(true);
      setLoading(false);
      _resolveKcReady();
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
