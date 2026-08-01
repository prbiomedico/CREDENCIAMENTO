import React from 'react';
import DashboardLayout from '../components/DashboardLayout';
import DocumentosEstadoTab from '../components/DocumentosEstadoTab';

// Tela genérica de documentos GOV-CRD-001 (sem estado travado). A lógica de
// filtros/upload/histórico/edição/soft-delete vive em DocumentosEstadoTab,
// reaproveitada também pela aba "Documentos" da página Estado > UF.
const DocumentosGov = () => {
  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <DocumentosEstadoTab />
      </div>
    </DashboardLayout>
  );
};

export default DocumentosGov;
