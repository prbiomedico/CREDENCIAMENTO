import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
export default function EntregasConferencia({ ufs, onOpen }) {
  const [result, setResult] = useState(null);
  const [version, setVersion] = useState(0);
  const key = [...new Set(ufs)].sort().join(',');
  useEffect(() => {
    let active = true;
    setResult(null);
    if (!key) return;
    Promise.allSettled(key.split(',').map(uf => axios.get(`${API}/submissoes`, { params: { estado_sigla: uf }, withCredentials: true }))).then(results => {
      if (!active) return;
      setResult({ key, failed: results.some(r => r.status === 'rejected'), rows: results.flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data : []).filter(s => s.status === 'submetido' || (s.status === 'em_analise' && s.itens?.some(i => i.status === 'enviado'))) });
    });
    return () => { active = false; };
  }, [key, version]);
  if (!key) return null;
  return <section className="rounded-lg border bg-card p-4 space-y-3" aria-label="Envios aguardando conferência">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Documentos recebidos para conferência</h2><Button variant="outline" onClick={() => setVersion(v => v + 1)}>Atualizar avisos</Button></div>
    <p className="text-sm text-muted-foreground">Entregas finalizadas pelas empresas no SIGCR. Selecione um pedido para conferir os documentos.</p>
    {!result || result.key !== key ? <p role="status">Consultando envios...</p> : <>
      {result.failed && <p role="alert">Não foi possível consultar todos os estados. Atualize os avisos.</p>}
      {!result.rows.length && !result.failed && <p className="text-sm">Nenhuma entrega finalizada aguardando conferência.</p>}
      {result.rows.map(s => <div key={s.submissao_id} className="flex flex-wrap justify-between items-center gap-3 rounded border p-3">
        <div><p className="font-medium">DETRAN-{s.estado_sigla} · {s.status === 'submetido' ? 'Novo envio para conferência' : 'Documentos aguardando análise'}</p><p className="text-sm text-muted-foreground">{s.itens?.filter(i => i.status === 'enviado').length || 0} itens aguardando conferência</p></div>
        <Button onClick={() => onOpen(s)}>Conferir documentos</Button>
      </div>)}
    </>}
  </section>;
}
