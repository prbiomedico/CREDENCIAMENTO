import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from './Dashboard';

let mockPerfil = 'registradora';
let mockRole = 'sigcr_admin';
jest.mock('../contexts/AuthContext', () => ({useAuth: () => ({user: {perfil: mockRole}, initialized: true})}));
jest.mock('../contexts/PerfilAtivoContext', () => ({usePerfilAtivo: () => ({perfilAtivo: mockPerfil})}));
jest.mock('../contexts/ViewContext', () => ({useViewContext: () => ({viewingAs: null})}));
jest.mock('../hooks/useApi', () => ({useApi: () => ({get: jest.fn()})}));
jest.mock('react-router-dom', () => ({useNavigate: () => jest.fn()}));
jest.mock('../components/DashboardLayout', () => ({__esModule: true, default: ({children}) => <main>{children}</main>}));
jest.mock('./EmpresaRegistradora', () => ({__esModule: true, default: () => <h1>Painel da Registradora</h1>}));
jest.mock('../components/ui/interactive-map', () => ({MapaNacional: () => null}));

test.each([
  ['registradora', 'Painel da Registradora'],
  ['financeira', 'Painel da Financeira'],
  ['detran', 'Painel do DETRAN'],
])('administrador recebe o conteúdo da visão %s', (perfil, titulo) => {
  mockRole = 'sigcr_admin';
  mockPerfil = perfil;
  expect(renderToStaticMarkup(<Dashboard />)).toContain(titulo);
});

test('perfil ativo divergente não troca o ambiente de um cliente real', () => {
  mockRole = 'registradora';
  mockPerfil = 'detran';
  const html = renderToStaticMarkup(<Dashboard />);
  expect(html).toContain('Painel da Registradora');
  expect(html).not.toContain('Painel do DETRAN');
});
