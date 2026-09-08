import React from 'react';
import { useNavigate } from 'react-router-dom';
import HeroSection, { heroIcons } from '@/components/ui/hero-section';

const LANDING_DATA = {
  navLinks: [
    { text: 'Produto', href: '#produto' },
    { text: 'Segurança', href: '#seguranca' },
    { text: 'Cobertura nacional', href: '/mapa-nacional' },
    { text: 'Planos', href: '/planos' },
  ],
  previewRows: [
    { number: 'PORTARIA 142/2026', title: 'Credenciamento de registradoras', agency: 'DETRAN', uf: 'Distrito Federal', status: 'Vigente', tone: 'vigente', date: '02/09/2026' },
    { number: 'EDITAL 031/2026', title: 'Processo de habilitação técnica', agency: 'DETRAN', uf: 'São Paulo', status: 'Em análise', tone: 'analise', date: '29/08/2026' },
    { number: 'PORTARIA 087/2026', title: 'Requisitos para registro eletrônico', agency: 'DETRAN', uf: 'Paraná', status: 'Publicado', tone: 'publicado', date: '26/08/2026' },
    { number: 'EDITAL 019/2026', title: 'Chamamento para credenciamento', agency: 'DETRAN', uf: 'Goiás', status: 'Encerrado', tone: 'encerrado', date: '18/08/2026' },
  ],
  capabilities: [
    { icon: heroIcons.FileText, title: 'Portarias e editais', description: 'Busca, organização por UF, deep-links e documentos oficiais reunidos em uma visão operacional.' },
    { icon: heroIcons.Building2, title: 'Empresas e perfis', description: 'Contexto específico para registradoras, financeiras, DETRANs e administração central.' },
    { icon: heroIcons.FileCheck2, title: 'Dossiês verificáveis', description: 'Uploads, anexos, termos e checklists acompanhados do envio até a conferência.' },
    { icon: heroIcons.CalendarDays, title: 'Prazos e decisões', description: 'Status semânticos, pendências e histórico para orientar cada próxima ação.' },
  ],
};

const Landing = () => {
  const navigate = useNavigate();
  const handleLogin = () => {
    // /dashboard mantém o contrato atual de autenticação; não usar URL externa.
    navigate('/dashboard');
  };
  return <HeroSection data={LANDING_DATA} onLogin={handleLogin} />;
};

export default Landing;
