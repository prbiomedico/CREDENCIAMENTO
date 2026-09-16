import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle, Circle, Clock, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const API = `${process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'}/api`;
const ETAPAS = [
  ['requerimento', 'Requerimento'], ['documentos', 'Análise documental'], ['poc', 'POC'],
  ['taxa', 'Taxa de credenciamento'], ['contrato', 'Contrato'], ['homologacao', 'Homologação'],
  ['publicacao', 'Diário Oficial'],
];

const etapaAtual = (s) => {
  if (s.status === 'homologado') return 6;
  if (s.status === 'homologacao_pendente') return 5;
  if (['contrato_pendente', 'contrato_assinatura'].includes(s.status)) return 4;
  if (s.status === 'taxa_credenciamento') return 3;
  if (['poc_agendada', 'poc_aprovada', 'poc_reprovada'].includes(s.status)) return 2;
  if (['submetido', 'em_analise', 'em_diligencia'].includes(s.status)) return 1;
  return 0;
};

const Campo = ({ label, ...props }) => <div><Label className="text-xs text-slate-600">{label}</Label><Input {...props} className="mt-1 bg-white" /></div>;

export default function FluxoCredenciamento({ submissao, modo, onAtualizar }) {
  const [busy, setBusy] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [form, setForm] = useState({ modalidade: 'remota', valor: '0', resultado: 'aprovada' });
  const tentativa = useMemo(() => (submissao.tentativas_poc || []).at(-1), [submissao]);
  const atual = etapaAtual(submissao);
  const todosConformes = submissao.itens?.length > 0 && submissao.itens.every((i) => i.status === 'conforme');
  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const executar = async (acao) => {
    setBusy(true);
    try { const data = await acao(); onAtualizar?.(data); setArquivo(null); toast.success('Etapa atualizada com sucesso'); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Não foi possível atualizar a etapa'); }
    finally { setBusy(false); }
  };
  const fdArquivo = () => { const fd = new FormData(); if (arquivo) fd.append('file', arquivo); return fd; };
  const baixar = async (rota, nome) => {
    try {
      const res = await axios.get(`${API}${rota}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data); const link = document.createElement('a');
      link.href = url; link.download = nome; link.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Não foi possível baixar o documento'); }
  };

  return <div className="space-y-4">
    <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Jornada do credenciamento</CardTitle></CardHeader><CardContent>
      <div className="grid gap-2 md:grid-cols-7">{ETAPAS.map(([id, nome], i) => {
        const concluida = i < atual || submissao.status === 'homologado'; const ativa = i === atual && submissao.status !== 'homologado';
        return <div key={id} className={`rounded-lg border p-3 ${concluida ? 'border-emerald-200 bg-emerald-50' : ativa ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          {concluida ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : ativa ? <Clock className="h-4 w-4 text-amber-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
          <p className="mt-2 text-xs font-medium text-slate-700">{nome}</p>
        </div>;
      })}</div>
    </CardContent></Card>

    {(submissao.tentativas_poc || []).length > 0 && <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Histórico de tentativas da POC</CardTitle></CardHeader><CardContent className="space-y-2">
      {submissao.tentativas_poc.map((t) => <div key={t.tentativa_id} className="grid gap-2 rounded-lg border p-3 text-xs md:grid-cols-5">
        <strong>Tentativa {t.numero}</strong><span>{new Date(t.data_agendada).toLocaleString('pt-BR')}</span><span>{t.modalidade}</span><span>Taxa: R$ {Number(t.valor_taxa || 0).toFixed(2)}</span><span className="font-semibold">{t.resultado === 'aguardando' ? t.pagamento_status : t.resultado}</span>
        {t.resultado_justificativa && <p className="md:col-span-5 text-red-600">{t.resultado_justificativa}</p>}
        {t.resultado_documento_path && <Button size="sm" variant="outline" className="md:col-span-2" onClick={() => baixar(`/submissoes/${submissao.submissao_id}/poc/${t.tentativa_id}/resultado/download`, `resultado_poc_${t.numero}.pdf`)}><FileText className="mr-2 h-4 w-4" />Baixar resultado oficial</Button>}
      </div>)}
    </CardContent></Card>}

    {(submissao.contrato || submissao.publicacao_oficial) && <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Documentos oficiais do processo</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
      {submissao.contrato?.minuta_path && <Button variant="outline" onClick={() => baixar(`/submissoes/${submissao.submissao_id}/contrato/minuta/download`, 'contrato_para_assinatura.pdf')}>Baixar contrato</Button>}
      {submissao.contrato?.assinado_path && <Button variant="outline" onClick={() => baixar(`/submissoes/${submissao.submissao_id}/contrato/assinado/download`, 'contrato_assinado.pdf')}>Baixar contrato assinado</Button>}
      {submissao.publicacao_oficial?.documento_path && <Button variant="outline" onClick={() => baixar(`/submissoes/${submissao.submissao_id}/publicacao/download`, 'ato_homologacao.pdf')}>Baixar ato publicado</Button>}
    </CardContent></Card>}

    {modo === 'detran' && <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Ação do DETRAN</CardTitle></CardHeader><CardContent className="space-y-3">
      {todosConformes && ['em_analise', 'poc_reprovada'].includes(submissao.status) && <><div className="grid gap-3 md:grid-cols-3"><Campo label="Data e horário" type="datetime-local" value={form.data || ''} onChange={(e) => update('data', e.target.value)} /><Campo label="Local / link" value={form.local || ''} onChange={(e) => update('local', e.target.value)} /><Campo label="Responsável" value={form.responsavel || ''} onChange={(e) => update('responsavel', e.target.value)} /><Campo label="Valor da tentativa" type="number" min="0" step="0.01" value={form.valor} onChange={(e) => update('valor', e.target.value)} /><div><Label className="text-xs text-slate-600">Modalidade</Label><select className="mt-1 h-10 w-full rounded-md border px-3 text-sm" value={form.modalidade} onChange={(e) => update('modalidade', e.target.value)}><option value="remota">Remota</option><option value="presencial">Presencial</option><option value="hibrida">Híbrida</option></select></div></div><Textarea placeholder="Instruções da POC" value={form.instrucoes || ''} onChange={(e) => update('instrucoes', e.target.value)} />
        <Button disabled={busy || !form.data || !form.local || !form.responsavel} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/poc/agendar`, { data_agendada: new Date(form.data).toISOString(), modalidade: form.modalidade, local: form.local, responsavel: form.responsavel, valor_taxa: Number(form.valor), instrucoes: form.instrucoes || null })).data)}>Agendar {submissao.status === 'poc_reprovada' ? 'nova tentativa' : 'POC'}</Button></>}

      {tentativa?.pagamento_status === 'em_analise' && <div className="flex gap-2"><Button disabled={busy} onClick={() => executar(async () => (await axios.patch(`${API}/submissoes/${submissao.submissao_id}/poc/${tentativa.tentativa_id}/pagamento`, { status: 'aprovado' })).data)}>Aprovar pagamento da POC</Button><Button variant="destructive-outline" disabled={busy} onClick={() => executar(async () => (await axios.patch(`${API}/submissoes/${submissao.submissao_id}/poc/${tentativa.tentativa_id}/pagamento`, { status: 'rejeitado', justificativa: 'Comprovante não validado' })).data)}>Rejeitar pagamento</Button></div>}

      {submissao.status === 'poc_agendada' && ['aprovado', 'isento'].includes(tentativa?.pagamento_status) && tentativa?.resultado === 'aguardando' && <><div className="grid gap-3 md:grid-cols-2"><div><Label>Resultado</Label><select className="mt-1 h-10 w-full rounded-md border px-3" value={form.resultado} onChange={(e) => update('resultado', e.target.value)}><option value="aprovada">Aprovada</option><option value="reprovada">Reprovada</option></select></div><Campo label="Documento oficial do resultado" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></div>{form.resultado === 'reprovada' && <Textarea placeholder="Motivo obrigatório da reprovação" value={form.justificativa || ''} onChange={(e) => update('justificativa', e.target.value)} />}<Button disabled={busy || !arquivo || (form.resultado === 'reprovada' && !form.justificativa)} onClick={() => executar(async () => { const fd=fdArquivo(); fd.append('resultado', form.resultado); fd.append('justificativa', form.justificativa || ''); return (await axios.post(`${API}/submissoes/${submissao.submissao_id}/poc/${tentativa.tentativa_id}/resultado`, fd)).data; })}>Registrar resultado e anexar documento</Button></>}

      {submissao.status === 'poc_aprovada' && <><Campo label="Taxa final de credenciamento" type="number" min="0" step="0.01" value={form.valorFinal || '0'} onChange={(e) => update('valorFinal', e.target.value)} /><Button disabled={busy} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/taxa-credenciamento`, { valor: Number(form.valorFinal || 0) })).data)}>Emitir taxa de credenciamento</Button></>}
      {submissao.taxa_credenciamento?.status === 'em_analise' && <div className="flex gap-2"><Button disabled={busy} onClick={() => executar(async () => (await axios.patch(`${API}/submissoes/${submissao.submissao_id}/taxa-credenciamento/pagamento`, { status: 'aprovado' })).data)}>Aprovar taxa final</Button><Button variant="destructive-outline" disabled={busy} onClick={() => executar(async () => (await axios.patch(`${API}/submissoes/${submissao.submissao_id}/taxa-credenciamento/pagamento`, { status: 'rejeitado', justificativa: 'Comprovante não validado' })).data)}>Rejeitar</Button></div>}
      {submissao.status === 'contrato_pendente' && <><Campo label="Contrato para assinatura" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /><Button disabled={busy || !arquivo} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/contrato`, fdArquivo())).data)}>Disponibilizar contrato</Button></>}
      {submissao.status === 'homologacao_pendente' && <><div className="grid gap-3 md:grid-cols-3"><Campo label="Número do ato" value={form.numeroAto || ''} onChange={(e) => update('numeroAto', e.target.value)} /><Campo label="Data da publicação" type="date" value={form.dataPublicacao || ''} onChange={(e) => update('dataPublicacao', e.target.value)} /><Campo label="Veículo oficial" value={form.veiculo || ''} onChange={(e) => update('veiculo', e.target.value)} /><Campo label="Link da publicação" value={form.link || ''} onChange={(e) => update('link', e.target.value)} /><Campo label="PDF do ato publicado" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></div><Button disabled={busy || !arquivo || !form.numeroAto || !form.dataPublicacao || !form.veiculo} onClick={() => executar(async () => { const fd=fdArquivo(); fd.append('numero_ato',form.numeroAto); fd.append('data_publicacao',form.dataPublicacao); fd.append('veiculo_oficial',form.veiculo); fd.append('link_publicacao',form.link||''); return (await axios.post(`${API}/submissoes/${submissao.submissao_id}/homologacao-publicacao`,fd)).data; })}>Homologar e registrar publicação</Button></>}
      {!todosConformes && <p className="text-sm text-slate-500">Conclua a análise documental para liberar o agendamento da POC.</p>}
    </CardContent></Card>}

    {modo === 'empresa' && <Card className="bg-white"><CardHeader><CardTitle className="text-sm">Próxima ação da empresa</CardTitle></CardHeader><CardContent className="space-y-3">
      {submissao.status === 'poc_agendada' && ['pendente','rejeitado'].includes(tentativa?.pagamento_status) && <><p className="text-sm">Envie o comprovante da taxa da tentativa {tentativa.numero}.</p><Campo label="Comprovante da POC" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /><Button disabled={busy || !arquivo} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/poc/${tentativa.tentativa_id}/comprovante`, fdArquivo())).data)}>Enviar comprovante</Button></>}
      {submissao.status === 'taxa_credenciamento' && ['pendente','rejeitado'].includes(submissao.taxa_credenciamento?.status) && <><p className="text-sm">POC aprovada. Envie o comprovante da taxa final de credenciamento.</p><Campo label="Comprovante da taxa final" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /><Button disabled={busy || !arquivo} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/taxa-credenciamento/comprovante`, fdArquivo())).data)}>Enviar comprovante</Button></>}
      {submissao.status === 'contrato_assinatura' && <><p className="text-sm">O contrato está disponível. Envie a versão assinada.</p><Campo label="Contrato assinado" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /><Button disabled={busy || !arquivo} onClick={() => executar(async () => (await axios.post(`${API}/submissoes/${submissao.submissao_id}/contrato/assinado`, fdArquivo())).data)}>Enviar contrato assinado</Button></>}
      {!['poc_agendada','taxa_credenciamento','contrato_assinatura'].includes(submissao.status) && <p className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="h-4 w-4" />Acompanhe aqui a próxima orientação do DETRAN.</p>}
    </CardContent></Card>}
  </div>;
}
