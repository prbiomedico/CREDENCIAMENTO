import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ViewProvider } from './contexts/ViewContext';
import { PerfilAtivoProvider } from './contexts/PerfilAtivoContext';
import { Toaster } from '@/components/ui/sonner';
import RotaProtegida from './components/RotaProtegida';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Planos from './pages/Planos';
import Checkout from './pages/Checkout';
import PagamentoAguardando from './pages/PagamentoAguardando';
import AppMobile from './pages/AppMobile';
import UploadDocumentos from './pages/UploadDocumentos';
import { CookieBanner } from './components/ui/cookie-banner';
import MapaNacional from './pages/MapaNacional';
import Dashboard from './pages/Dashboard';
import EmpresaRegistradora from './pages/EmpresaRegistradora';
import EmpresaFinanceira from './pages/EmpresaFinanceira';
import Portarias from './pages/Portarias';
import Documentos from './pages/Documentos';
import Editais from './pages/Editais';
import Solicitacoes from './pages/Solicitacoes';
import Notificacoes from './pages/Notificacoes';
import CriarEvento from './pages/CriarEvento';
import Esteiras from './pages/Esteiras';
import SolicitacaoDetalhe from './pages/SolicitacaoDetalhe';
import GestaoUsuarios from './pages/GestaoUsuarios';
import DocumentosGov from './pages/DocumentosGov';
import Estados from './pages/Estados';
import EstadoDetalhe from './pages/EstadoDetalhe';
import Transparencia from './pages/Transparencia';
import MinhasSubmissoes from './pages/MinhasSubmissoes';
import PainelConferencia from './pages/PainelConferencia';
import Registradoras from './pages/Registradoras';
import Financeiras from './pages/Financeiras';
import SolicitacaoRegistro from './pages/SolicitacaoRegistro';
import FilaRegistros from './pages/FilaRegistros';
import CadastroPublico from './pages/CadastroPublico';
import SeloPublico from './pages/SeloPublico';
import '@/App.css';

// Cada rota recebe seu próprio ErrorBoundary (não um único global): um crash
// numa tela não deve afetar as outras, e navegar pra outra rota — mesmo que
// seja a mesma Route com um :param diferente, daí o key por pathname — deve
// sempre partir de um estado limpo, sem carregar o crash da tela anterior.
function RouteBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  const b = (el) => <RouteBoundary>{el}</RouteBoundary>;
  return (
    <Routes>
        <Route path="/" element={b(<Landing />)} />
        <Route path="/dashboard" element={b(<RotaProtegida><Dashboard /></RotaProtegida>)} />
        <Route path="/registradoras-empresa" element={b(<RotaProtegida perfilPermitido="registradora"><EmpresaRegistradora /></RotaProtegida>)} />
        <Route path="/financeiras-empresa" element={b(<RotaProtegida perfilPermitido="financeira"><EmpresaFinanceira /></RotaProtegida>)} />
        <Route path="/portarias" element={b(<RotaProtegida perfilPermitido={["registradora", "financeira", "detran", "detran_admin"]}><Portarias /></RotaProtegida>)} />
        <Route path="/planos" element={b(<Planos />)} />
        <Route path="/cadastro" element={b(<CadastroPublico />)} />
        <Route path="/selo/:companyId" element={b(<SeloPublico />)} />
        <Route path="/transparencia" element={b(<Transparencia />)} />
        <Route path="/transparencia/:uf" element={b(<Transparencia />)} />
          <Route path="/checkout" element={b(<Checkout />)} />
          <Route path="/pagamento/aguardando" element={b(<PagamentoAguardando />)} />
          <Route path="/app-mobile" element={b(<AppMobile />)} />
          <Route path="/documentos/upload" element={b(<UploadDocumentos />)} />
          <Route path="/mapa-nacional" element={b(<MapaNacional />)} />
          <Route path="/documentos" element={b(<RotaProtegida perfilPermitido={["registradora", "financeira"]}><Documentos /></RotaProtegida>)} />
          <Route path="/registro-contrato" element={b(<RotaProtegida perfilPermitido="financeira"><SolicitacaoRegistro /></RotaProtegida>)} />
          <Route path="/fila-registros" element={b(<RotaProtegida perfilPermitido="registradora"><FilaRegistros /></RotaProtegida>)} />
          <Route path="/credenciamento-portaria" element={b(<RotaProtegida perfilPermitido={["registradora", "financeira"]}><MinhasSubmissoes /></RotaProtegida>)} />
          <Route path="/detran/conferencia" element={b(<RotaProtegida perfilPermitido={["sigcr_admin", "detran", "detran_admin"]}><PainelConferencia /></RotaProtegida>)} />
          <Route path="/credenciamento/documentos" element={b(<RotaProtegida perfilPermitido={["detran", "detran_admin"]}><DocumentosGov /></RotaProtegida>)} />
          <Route path="/estados" element={b(<RotaProtegida perfilPermitido={["detran", "detran_admin"]}><Estados /></RotaProtegida>)} />
          <Route path="/registradoras" element={b(<RotaProtegida perfilPermitido={["sigcr_admin", "detran", "detran_admin"]}><Registradoras /></RotaProtegida>)} />
          <Route path="/financeiras" element={b(<RotaProtegida perfilPermitido={["sigcr_admin", "detran", "detran_admin"]}><Financeiras /></RotaProtegida>)} />
          <Route path="/estados/:sigla" element={b(<RotaProtegida perfilPermitido={["detran", "detran_admin"]}><EstadoDetalhe /></RotaProtegida>)} />
        <Route path="/mapa" element={b(<RotaProtegida perfilPermitido={["detran", "detran_admin"]}><MapaNacional /></RotaProtegida>)} />
        <Route path="/editais" element={b(<RotaProtegida perfilPermitido={["registradora", "financeira", "detran", "detran_admin"]}><Editais /></RotaProtegida>)} />
        <Route path="/solicitacoes" element={b(<RotaProtegida perfilPermitido={["registradora", "detran", "detran_admin"]}><Solicitacoes /></RotaProtegida>)} />
        <Route path="/notificacoes" element={b(<RotaProtegida><Notificacoes /></RotaProtegida>)} />
        <Route path="/criar-evento" element={b(<RotaProtegida perfilPermitido={["detran", "detran_admin"]}><CriarEvento /></RotaProtegida>)} />
      <Route path="/esteiras" element={b(<RotaProtegida><Esteiras /></RotaProtegida>)} />
      <Route path="/solicitacoes/:id" element={b(<RotaProtegida perfilPermitido={["registradora", "detran", "detran_admin"]}><SolicitacaoDetalhe /></RotaProtegida>)} />
      <Route path="/usuarios" element={b(<RotaProtegida perfilPermitido="sigcr_admin"><GestaoUsuarios /></RotaProtegida>)} />
      <Route path="/configuracoes" element={b(<RotaProtegida perfilPermitido="sigcr_admin"><GestaoUsuarios /></RotaProtegida>)} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ViewProvider>
          <PerfilAtivoProvider>
            <AppRoutes />
            <CookieBanner />
            <Toaster position="top-right" />
          </PerfilAtivoProvider>
        </ViewProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
