/**
 * Testa o interceptor de "ver como" (registrado em AuthContext.js, ao lado
 * do interceptor de token) da mesma forma que AuthContext.race.test.js testa
 * o interceptor de token: via window.__viewContext direto, sem montar
 * <AuthProvider>/<ViewProvider> (mesma limitação de ambiente já documentada
 * lá — Jest/React 19/keycloak-js mock não invoca .init() dentro do useEffect
 * real). Isso testa o mecanismo de verdade que roda em produção.
 */
import axios from 'axios';

jest.mock('keycloak-js', () => class { constructor() {} });

require('./AuthContext');

describe('interceptor "ver como" — injeta view_as_company_id/view_as_detran_uf', () => {
  beforeEach(() => {
    axios.defaults.adapter = undefined;
    window.__kcReady = Promise.resolve();
    window.__kc = { authenticated: true, token: 'tok', updateToken: jest.fn().mockResolvedValue(true) };
    window.__viewContext = { viewingAs: null };
  });

  test('sem viewingAs, não injeta nenhum parâmetro', async () => {
    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
    await axios.get('/api/companies');
    expect(capturedConfig.params?.view_as_company_id).toBeUndefined();
    expect(capturedConfig.params?.view_as_detran_uf).toBeUndefined();
  });

  test('viewingAs tipo empresa injeta view_as_company_id', async () => {
    window.__viewContext.viewingAs = { tipo: 'empresa', id: 'company_hdregistros', nome: 'HD Registros' };
    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
    await axios.get('/api/companies');
    expect(capturedConfig.params.view_as_company_id).toBe('company_hdregistros');
    expect(capturedConfig.params.view_as_detran_uf).toBeUndefined();
  });

  test('viewingAs tipo detran injeta view_as_detran_uf', async () => {
    window.__viewContext.viewingAs = { tipo: 'detran', id: 'SP', nome: 'São Paulo' };
    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
    await axios.get('/api/documentos');
    expect(capturedConfig.params.view_as_detran_uf).toBe('SP');
    expect(capturedConfig.params.view_as_company_id).toBeUndefined();
  });

  test('injeta como query param mesmo em upload multipart (FormData), sem tocar o body', async () => {
    window.__viewContext.viewingAs = { tipo: 'empresa', id: 'company_hdregistros', nome: 'HD Registros' };
    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
    const formData = new FormData();
    formData.append('company_id', 'company_hdregistros');
    formData.append('document_type', 'outros');
    await axios.post('/api/documents/upload', formData);
    expect(capturedConfig.params.view_as_company_id).toBe('company_hdregistros');
    expect(capturedConfig.data).toBe(formData); // body intocado
  });

  test('sair do modo (viewingAs volta a null) para de injetar', async () => {
    window.__viewContext.viewingAs = { tipo: 'empresa', id: 'company_hdregistros', nome: 'HD Registros' };
    window.__viewContext.viewingAs = null; // simula ViewProvider.sair()
    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };
    await axios.get('/api/companies');
    expect(capturedConfig.params?.view_as_company_id).toBeUndefined();
  });
});
