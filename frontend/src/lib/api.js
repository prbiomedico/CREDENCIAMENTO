import axios from 'axios';

// Interceptor global — injeta token Keycloak em todo axios
axios.interceptors.request.use((config) => {
  try {
    const token = window.__keycloak_token__;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

export default axios;
