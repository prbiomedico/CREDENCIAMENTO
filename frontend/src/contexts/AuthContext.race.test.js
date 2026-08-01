/**
 * Testa o cenário de corrida do bug "Nenhuma empresa cadastrada"/"Erro ao
 * cadastrar empresa": uma chamada à API disparada ANTES do Keycloak terminar
 * de assentar não pode mais sair sem esperar — antes desse fix, o interceptor
 * só olhava window.__kc.authenticated/token naquele instante exato, e uma
 * chamada nessa janela saía sem Authorization, virando 401 no backend.
 *
 * Este teste exercita o interceptor de verdade (importado do arquivo real,
 * não reimplementado) via os globais que ele já usa (window.__kc,
 * window.__kcReady) — sem montar o componente <AuthProvider> via
 * react-dom/test-utils, porque essa combinação específica (Jest + React 19 +
 * mock de keycloak-js dentro de um useEffect) bateu num problema de
 * infraestrutura de teste neste ambiente (o `.init()` mockado não era
 * chamado dentro do efeito, mesmo com a classe mockada corretamente
 * resolvida no import — investigado a fundo, não é um problema do código de
 * produção). Substituir window.__kcReady por uma promise controlável no
 * teste testa exatamente o mecanismo que foi corrigido (o interceptor espera
 * a promise antes de decidir anexar o token), só não testa a ligação entre
 * o useEffect do AuthProvider e o resolve dessa promise — essa parte é
 * verificada por revisão de código (duas chamadas de uma linha a
 * _resolveKcReady(), uma em cada branch do .then()/.catch()).
 */
import axios from 'axios';

// keycloak-js é distribuído só como ESM puro (export default class ...) e o
// preset de Jest do CRA/craco não transforma pacotes de node_modules por
// padrão — sem mockar, o require abaixo quebra com SyntaxError antes de
// qualquer teste rodar. Só precisamos de um construtor inofensivo: o
// keycloak.init() real (chamado pelo useEffect do AuthProvider) não entra
// em cena neste arquivo, que testa o interceptor via window.__kc/__kcReady
// diretamente.
jest.mock('keycloak-js', () => class { constructor() {} });

// Carrega o módulo real — roda os efeitos de topo de arquivo (window.__kc,
// window.__kcReady, registro do interceptor no axios).
require('./AuthContext');

describe('interceptor do axios — espera window.__kcReady antes de liberar chamadas', () => {
  beforeEach(() => {
    axios.defaults.adapter = undefined;
  });

  test('requisição disparada antes do Keycloak assentar fica pendurada, e sai com Authorization depois', async () => {
    let resolveKcReady;
    window.__kcReady = new Promise((resolve) => { resolveKcReady = resolve; });
    window.__kc = { authenticated: false, token: null, updateToken: jest.fn().mockResolvedValue(true) };

    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    let resolved = false;
    const reqPromise = axios.get('/api/companies').then((r) => { resolved = true; return r; });

    // Ainda não assentou — a requisição não pode ter saído.
    await new Promise((r) => setTimeout(r, 50));
    expect(capturedConfig).toBeNull();
    expect(resolved).toBe(false);

    // Simula o Keycloak terminando de assentar: autenticado, com token.
    window.__kc.authenticated = true;
    window.__kc.token = 'fake-jwt-token-abc';
    resolveKcReady();
    await reqPromise;

    expect(resolved).toBe(true);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig.headers.Authorization).toBe('Bearer fake-jwt-token-abc');
  });

  test('usuário anônimo (kcReady resolve mas ninguém autenticado) não trava a requisição pra sempre', async () => {
    let resolveKcReady;
    window.__kcReady = new Promise((resolve) => { resolveKcReady = resolve; });
    window.__kc = { authenticated: false, token: null, updateToken: jest.fn() };

    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    const reqPromise = axios.get('/api/public/editais/SP');
    resolveKcReady(); // check-sso terminou: ninguém logado
    await reqPromise;

    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig.headers.Authorization).toBeUndefined();
  });

  test('requisição disparada DEPOIS do Keycloak já ter assentado sai imediatamente (sem regressão no caso normal)', async () => {
    window.__kcReady = Promise.resolve(); // já assentado antes da requisição existir
    window.__kc = { authenticated: true, token: 'token-ja-pronto', updateToken: jest.fn().mockResolvedValue(true) };

    let capturedConfig = null;
    axios.defaults.adapter = (config) => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    await axios.get('/api/companies');
    expect(capturedConfig.headers.Authorization).toBe('Bearer token-ja-pronto');
  });
});
