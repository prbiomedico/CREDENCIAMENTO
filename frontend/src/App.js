import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Planos from './pages/Planos';
import Checkout from './pages/Checkout';
import PagamentoAguardando from './pages/PagamentoAguardando';
import AppMobile from './pages/AppMobile';
import UploadDocumentos from './pages/UploadDocumentos';
import { CookieBanner } from './components/ui/cookie-banner';
import MapaNacional from './pages/MapaNacional';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import Portarias from './pages/Portarias';
import Documentos from './pages/Documentos';
import Editais from './pages/Editais';
import Solicitacoes from './pages/Solicitacoes';
import PainelDetran from './pages/PainelDetran';
import Notificacoes from './pages/Notificacoes';
import CriarEvento from './pages/CriarEvento';
import Esteiras from './pages/Esteiras';
import SolicitacaoDetalhe from './pages/SolicitacaoDetalhe';
import GestaoUsuarios from './pages/GestaoUsuarios';
import AnaliseDocumental from './pages/AnaliseDocumental';
import POC from './pages/POC';
import Homologacao from './pages/Homologacao';
import DocumentosGov from './pages/DocumentosGov';
import '@/App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/empresas" element={<ProtectedRoute><Empresas /></ProtectedRoute>} />
          <Route path="/portarias" element={<ProtectedRoute><Portarias /></ProtectedRoute>} />
          <Route path="/planos" element={<Planos />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/pagamento/aguardando" element={<PagamentoAguardando />} />
            <Route path="/app-mobile" element={<AppMobile />} />
            <Route path="/documentos/upload" element={<UploadDocumentos />} />
            <Route path="/mapa-nacional" element={<MapaNacional />} />
            <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
            <Route path="/credenciamento/documentos" element={<ProtectedRoute><DocumentosGov /></ProtectedRoute>} />
          <Route path="/mapa" element={<ProtectedRoute><MapaNacional /></ProtectedRoute>} />
          <Route path="/editais" element={<ProtectedRoute><Editais /></ProtectedRoute>} />
          <Route path="/solicitacoes" element={<ProtectedRoute><Solicitacoes /></ProtectedRoute>} />
          <Route path="/painel-detran" element={<ProtectedRoute><PainelDetran /></ProtectedRoute>} />
          <Route path="/detran/analise" element={<ProtectedRoute><AnaliseDocumental /></ProtectedRoute>} />
          <Route path="/detran/poc" element={<ProtectedRoute><POC /></ProtectedRoute>} />
          <Route path="/detran/homologacao" element={<ProtectedRoute><Homologacao /></ProtectedRoute>} />
          <Route path="/notificacoes" element={<ProtectedRoute><Notificacoes /></ProtectedRoute>} />
          <Route path="/criar-evento" element={<ProtectedRoute><CriarEvento /></ProtectedRoute>} />
        <Route path="/esteiras" element={<ProtectedRoute><Esteiras /></ProtectedRoute>} />
        <Route path="/solicitacoes/:id" element={<ProtectedRoute><SolicitacaoDetalhe /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><GestaoUsuarios /></ProtectedRoute>} />
        <Route path="/configuracoes" element={<ProtectedRoute><GestaoUsuarios /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      <CookieBanner />
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
