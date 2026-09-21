import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
export default function AcervoEmpresa({ companyId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    let active = true;
    setResult(null); setError(''); setSearch('');
    if (companyId) axios.get(`${API}/documents/${encodeURIComponent(companyId)}`, { withCredentials: true })
      .then(({ data }) => { if (active) setResult({ companyId, docs: data.filter(d => d.document_type === 'acervo_hd') }); })
      .catch(() => { if (active) setError('Não foi possível carregar o acervo da empresa.'); });
    return () => { active = false; };
  }, [companyId]);
  async function download(doc) {
    setBusy(doc.document_id); setError('');
    try {
      const { data } = await axios.get(`${API}/documents/download/${encodeURIComponent(doc.document_id)}`, { responseType: 'blob', withCredentials: true });
      const url = URL.createObjectURL(data); const a = document.createElement('a');
      a.href = url; a.download = doc.file_name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Não foi possível baixar o arquivo. Tente novamente.'); }
    finally { setBusy(null); }
  }
  if (error && !result) return <p role="alert">{error}</p>;
  if (!result || result.companyId !== companyId || !result.docs.length) return null;
  const docs = result.docs.filter(d => d.document_name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <details className="rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Acervo da empresa · Instituições financeiras ({result.docs.length})</summary>
    <p className="my-3 text-sm text-muted-foreground">Documentos de relacionamento e credenciamento junto a instituições financeiras, separados dos pedidos dos DETRANs. A inclusão no acervo não representa aprovação.</p>
    <input aria-label="Buscar no acervo da empresa" placeholder="Buscar documento ou instituição" value={search} onChange={e => setSearch(e.target.value)} className="mb-3 w-full rounded-md border bg-background p-2" />
    {error && <p role="alert">{error}</p>}
    <div className="max-h-96 space-y-2 overflow-y-auto">{docs.map(doc => <article key={doc.document_id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{doc.document_name}</p><p className="text-xs text-muted-foreground">Conferência pendente</p></div>
      <Button variant="outline" disabled={busy === doc.document_id} onClick={() => download(doc)}>Baixar</Button>
    </article>)}{!docs.length && <p>Nenhum documento encontrado.</p>}</div>
  </details>;
}
