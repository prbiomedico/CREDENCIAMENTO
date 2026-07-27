import { useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const BASE = `${BACKEND_URL}/api`;

export const useApi = () => {
  const { keycloak } = useAuth();
  const keycloakRef = useRef(keycloak);
  keycloakRef.current = keycloak;

  const request = useCallback(async (method, path, data = null) => {
    const kc = keycloakRef.current;
    if (kc?.authenticated) {
      try { await kc.updateToken(30); } catch {}
    }
    const token = kc?.token;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios({ method, url: `${BASE}${path}`, data, headers });
    return res.data;
  }, []);

  return {
    get: (path) => request('GET', path),
    post: (path, data) => request('POST', path, data),
    patch: (path, data) => request('PATCH', path, data),
    delete: (path) => request('DELETE', path),
  };
};
