import React, { useState } from 'react';

const data = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const campos = [
 ['data_ato','Data do ato',true], ['assinatura_ato','Assinatura do ato',true], ['assinatura_contratual','Assinatura contratual',true], ['publicacao','Publicação',true],
 ['inicio_contagem','Início da contagem',true], ['duracao_meses','Duração (meses)'], ['vencimento','Vencimento de controle',true],
 ['vencimento_tipo','Tipo do vencimento'], ['fundamento_calculo','Fundamento do cálculo'], ['antecedencia_formal_dias','Antecedência formal (dias)'],
 ['limite_protocolo','Limite formal calculado',true], ['pagina_secao','Página / seção'], ['conferencia','Proveniência'], ['sha256','SHA-256'],
];
export default function ControleCredenciamentos({creds,docs,companyId,onDownload,baixando}) {
 const [filtro,setFiltro]=useState('');
 const rows=creds.filter(c=>c.controle_documental).map(c=>({...c.controle_documental,id:c.credenciamento_id}));
 if(!rows.length)return null;
 const list=rows.filter(r=>(r.uf+' '+r.ato+' '+r.status_documental+' '+r.prioridade).toLocaleLowerCase().includes(filtro.toLocaleLowerCase()));
 const p1=rows.filter(r=>r.prioridade==='P1').length;
 const p2=rows.filter(r=>r.prioridade==='P2').length;
 return <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6" data-testid={`controle-documental-${companyId}`}>
  <h3 className="text-lg font-semibold text-slate-950">Controle documental de credenciamentos</h3>
  <p className="mt-1 text-sm text-slate-600">Referência: 23/11/2026 · {rows.length} UFs acompanhadas · {p1} prioridade P1 · {p2} prioridade P2</p>
  <p className="mt-2 text-xs leading-5 text-slate-600">Este levantamento não certifica regularidade operacional, renovação, aprovação de POC ou ausência de atos posteriores. Alertas são preventivos internos; os prazos formais aparecem em campo próprio.</p>
  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">SP: portaria conferida, aguardando Termo de Adesão para calcular vencimento. PE: fonte divergente, data proposta aguardando conferência. MA: em processo, aguardando documentos. Planilha consolidada atual ainda pendente de recebimento.</div>
  <p className="mt-3 text-xs text-slate-600">AL, AM, GO, PA e SE: <strong>Sem informação neste levantamento</strong>. Isso não significa descredenciamento.</p>
  <p className="mt-2 text-xs text-slate-500">Proveniência: 10 PDFs recuperados da conversa e idênticos ao acervo; 11 do acervo local sem confirmação direta dos anexos originais no levantamento inicial; novo PDF de SP recebido em 23/11/2026 e vinculado sem apagar o anterior. Documentos anteriores e de outras categorias foram preservados.</p>
  <label className="mt-4 block text-sm font-medium">Filtrar controle por UF, ato ou prioridade<input className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Ex.: MG, P1, portaria..." /></label>
  <div className="mt-4 space-y-2">{list.sort((a,b)=>a.prioridade.localeCompare(b.prioridade)||a.uf.localeCompare(b.uf)).map(r=>{
   const doc=docs.find(d=>d.documento_id===r.documento_id);
   return <details key={r.id} className="rounded-md border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm"><strong>{r.uf} · {r.prioridade}</strong><span className="ml-2">{r.status_documental}</span><span className="mt-1 block text-xs text-slate-600">{r.ato||'Ato ainda não comprovado'} · Vencimento: {data(r.vencimento)}{r.dias_restantes_referencia!=null?` · ${r.dias_restantes_referencia} dias na referência`:''}</span></summary>
    <p className="mt-3 text-xs text-slate-500">{r.natureza_documento}</p>
    <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">{campos.map(([k,label,isDate])=><div key={k} className="min-w-0"><dt className="font-semibold text-slate-600">{label}</dt><dd className="mt-1 break-words text-slate-900">{isDate?data(r[k]):(r[k]??'—')}</dd></div>)}</dl>
    {r.divergencias&&<p className="mt-4 rounded bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Divergências preservadas: </strong>{r.divergencias}</p>}
    {r.uf==='MA'&&<p className="mt-3 text-xs">Envio: {data(r.data_envio)} · Protocolo: {r.protocolo||'—'} · Aprovação: {data(r.data_aprovacao)}</p>}
    <p className="mt-3 text-sm"><strong>Próxima ação: </strong>{r.proxima_acao}</p>
    {r.notas&&<p className="mt-2 text-xs leading-5 text-slate-600">{r.notas}</p>}
    {r.dados_propostos_aguardando_fonte&&<div className="mt-3 rounded border border-amber-200 p-3 text-xs"><strong>Dados informados, sem adoção até conferir a fonte</strong><p className="mt-1">{r.dados_propostos_aguardando_fonte.ato} · vencimento proposto: {data(r.dados_propostos_aguardando_fonte.vencimento)}</p></div>}
    <p className="mt-3 text-xs text-slate-500">Fonte: {r.fonte||'Documento ainda não recebido'} · {r.fonte_dados}</p>
    {doc&&<button type="button" className="mt-3 rounded border border-slate-300 px-3 py-2 text-xs font-medium" disabled={baixando===doc.documento_id} onClick={()=>onDownload(companyId,doc)}>Baixar documento vinculado{r.substituicao_suspensa?' (fonte divergente)':''}</button>}
    <div className="mt-4 text-xs"><strong>Calendário preventivo interno</strong>{r.alertas_preventivos?.length?<ul className="mt-2 space-y-1">{r.alertas_preventivos.map(a=><li key={a.antecedencia_dias}>{a.antecedencia_dias} dias antes: {data(a.data)} · {a.situacao_referencia}</li>)}</ul>:<p className="mt-1 text-slate-500">Sem alertas datados: falta vencimento documental adotado.</p>}</div>
   </details>;
  })}</div>
  {!list.length&&<p className="mt-4 text-sm">Nenhum registro corresponde ao filtro.</p>}
 </section>;
}
