import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
export default function AcervoEmpresa({ companyId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const [group, setGroup] = useState('Todos');
  const [limit, setLimit] = useState(20);
  const scopeOf = doc => doc.document_type === 'acervo_hd' ? 'Instituições financeiras' : (/^([A-Z]{2}) — /.exec(doc.document_name || '')?.[1] || 'Outros documentos');
  useEffect(() => {
    let active = true;
    setResult(null); setError(''); setSearch(''); setGroup('Todos'); setLimit(20);
    if (companyId) axios.get(`${API}/documents/${encodeURIComponent(companyId)}`, { withCredentials: true })
      .then(({ data }) => { if (active) setResult({ companyId, docs: data }); })
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
  const groups = [...new Set(result.docs.map(scopeOf))].sort();
  const docs = result.docs.filter(d => (group === 'Todos' || scopeOf(d) === group) && `${d.document_name} ${d.file_name}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <section className="rounded-lg border bg-card p-4" aria-label="Acervo da empresa">
    <h2 className="text-lg font-semibold">Acervo da empresa · {result.docs.length} documentos</h2>
    <p className="my-3 text-sm text-muted-foreground">Arquivos da empresa organizados por estado de origem. As instituições financeiras têm um acervo separado. A importação não altera etapas nem aprova requisitos dos pedidos.</p>
    <div className="mb-3 flex flex-wrap gap-2">{['Todos', ...groups].map(g => <Button key={g} variant={group === g ? 'default' : 'outline'} size="sm" onClick={() => { setGroup(g); setLimit(20); }} aria-pressed={group === g}>{g} ({g === 'Todos' ? result.docs.length : result.docs.filter(d => scopeOf(d) === g).length})</Button>)}</div>
    {/^[A-Z]{2}$/.test(group) && <Link className="mb-3 block text-sm underline" to={`/acompanhamento/${group}?empresa=${encodeURIComponent(companyId)}`}>Abrir acompanhamento de {group}</Link>}
    <input aria-label="Buscar no acervo da empresa" placeholder="Buscar documento ou instituição" value={search} onChange={e => { setSearch(e.target.value); setLimit(20); }} className="mb-3 w-full rounded-md border bg-background p-2" />
    {error && <p role="alert">{error}</p>}
    <p className="mb-2 text-sm text-muted-foreground">{docs.length} documentos encontrados</p>
    <div className="max-h-96 space-y-2 overflow-y-auto">{docs.slice(0, limit).map(doc => <article key={doc.document_id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{doc.document_name}</p><p className="text-xs text-muted-foreground">{doc.status === 'approved' ? 'Aprovado no SIGCR' : doc.status === 'rejected' ? 'Rejeitado no SIGCR' : 'Conferência pendente'}</p></div>
      <Button variant="outline" disabled={busy === doc.document_id} onClick={() => download(doc)}>Baixar</Button>
    </article>)}{!docs.length && <p>Nenhum documento encontrado.</p>}</div>
    {docs.length > limit && <Button className="mt-3" variant="outline" onClick={() => setLimit(n => n + 20)}>Mostrar mais documentos</Button>}
  </section>;
}
