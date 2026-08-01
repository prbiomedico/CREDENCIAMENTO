import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, Shield, Zap, Users, Calendar, Copy, Check, ChevronRight, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const STEPS = ['Template','Detalhes','Documentos','Timeline','Revisar'];

const ICONS = { credenciamento: Shield, licitacao: Shield, dispensa: Zap, chamamento: Users };
const CORES = {
  credenciamento: { ativo: 'bg-orange-500/20 border-orange-500/50', inativo: 'bg-zinc-900/50 border-zinc-800', badge: 'bg-orange-500/10 text-orange-400' },
  licitacao: { ativo: 'bg-blue-500/20 border-blue-500/50', inativo: 'bg-zinc-900/50 border-zinc-800', badge: 'bg-blue-500/10 text-blue-400' },
  dispensa: { ativo: 'bg-emerald-500/20 border-emerald-500/50', inativo: 'bg-zinc-900/50 border-zinc-800', badge: 'bg-emerald-500/10 text-emerald-400' },
  chamamento: { ativo: 'bg-purple-500/20 border-purple-500/50', inativo: 'bg-zinc-900/50 border-zinc-800', badge: 'bg-purple-500/10 text-purple-400' },
};

const CriarEvento = () => {
  const { user, initialized } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventoSalvo, setEventoSalvo] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [form, setForm] = useState({ template: '', titulo: '', descricao: '', uf: '', orgao: '', data_abertura: '', data_encerramento: '', documentos_obrigatorios: [], timeline: [] });

  useEffect(() => { if (!initialized || !user) return; fetchTemplates(); }, [initialized, user]);

  const fetchTemplates = async () => {
    try { const r = await axios.get(`${API}/eventos/templates`); setTemplates(r.data); }
    catch { toast.error('Erro ao carregar templates'); }
    finally { setLoading(false); }
  };

  const selecionarTemplate = (key) => {
    const t = templates[key];
    setForm(f => ({ ...f, template: key, descricao: t.descricao, documentos_obrigatorios: [...t.documentos_padrao], timeline: t.timeline_padrao.map(x => ({ ...x })) }));
    setStep(1);
  };

  const toggleDoc = (doc) => setForm(f => ({ ...f, documentos_obrigatorios: f.documentos_obrigatorios.includes(doc) ? f.documentos_obrigatorios.filter(d => d !== doc) : [...f.documentos_obrigatorios, doc] }));

  const updateTimeline = (i, k, v) => setForm(f => ({ ...f, timeline: f.timeline.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));

  const handleSalvar = async (publicar = false) => {
    if (!form.titulo || !form.uf) { toast.error('Preencha ttulo e UF'); setStep(1); return; }
    setSaving(true);
    try {
      const payload = { ...form, data_abertura: form.data_abertura ? new Date(form.data_abertura).toISOString() : null, data_encerramento: form.data_encerramento ? new Date(form.data_encerramento).toISOString() : null };
      const res = await axios.post(`${API}/eventos`, payload);
      if (publicar) { await axios.patch(`${API}/eventos/${res.data.evento_id}/publicar`); toast.success('Evento publicado!'); }
      else { toast.success('Rascunho salvo!'); }
      setEventoSalvo({ ...res.data, status: publicar ? 'publicado' : 'rascunho' });
      setStep(5);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const copiarLink = () => { navigator.clipboard.writeText(eventoSalvo?.link_publico || ''); setCopiado(true); setTimeout(() => setCopiado(false), 2000); toast.success('Link copiado!'); };

  const tmpl = templates[form.template];
  const cor = CORES[form.template];
  const Icon = ICONS[form.template];

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center"><Plus className="h-5 w-5 text-orange-500" /></div>
            <div><h1 className="text-3xl font-heading font-bold">Criar Evento</h1><p className="text-zinc-500 text-sm">Configure um novo processo</p></div>
          </div>
          {step < 5 && (
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <React.Fragment key={i}>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all ${i === step ? 'bg-orange-500 text-white' : i < step ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-500'}`}>{i+1} <span className="hidden sm:inline">{s}</span></div>
                  {i < STEPS.length-1 && <div className={`h-px flex-1 ${i < step ? 'bg-orange-500/40' : 'bg-zinc-800'}`} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {step === 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(templates).map(([key, t]) => {
              const c = CORES[key]; const I = ICONS[key];
              return (
                <button key={key} onClick={() => selecionarTemplate(key)} className={`p-6 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] ${c.inativo}`}>
                  <div className={`w-12 h-12 rounded-xl ${c.badge} flex items-center justify-center mb-4`}><I className="h-6 w-6" /></div>
                  <h3 className="text-lg font-semibold text-white mb-1">{t.nome}</h3>
                  <p className="text-sm text-zinc-400 mb-4">{t.descricao}</p>
                  <div className="flex flex-wrap gap-1">{t.documentos_padrao.slice(0,3).map(d => <span key={d} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">{d}</span>)}{t.documentos_padrao.length > 3 && <span className="text-[10px] text-zinc-600">+{t.documentos_padrao.length-3}</span>}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && tmpl && (
          <div className="space-y-5">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono ${cor?.badge}`}>{Icon && <Icon className="h-4 w-4" />}{tmpl.nome}</div>
            <div><Label className="text-zinc-300 text-sm mb-1.5 block">Ttulo *</Label><Input value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} className="bg-zinc-950 border-zinc-800 focus:border-orange-500 text-white" placeholder="Ex: Credenciamento de Registradoras DF 2026" /></div>
            <div><Label className="text-zinc-300 text-sm mb-1.5 block">Descrio</Label><Textarea value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} className="bg-zinc-950 border-zinc-800 text-white min-h-[80px]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">UF *</Label>
                <Select value={form.uf} onValueChange={v => setForm(f => ({...f, uf: v, orgao: `DETRAN-${v}`}))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">rgo</Label><Input value={form.orgao} onChange={e => setForm(f => ({...f, orgao: e.target.value}))} className="bg-zinc-950 border-zinc-800 text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">Abertura</Label><Input type="datetime-local" value={form.data_abertura} onChange={e => setForm(f => ({...f, data_abertura: e.target.value}))} className="bg-zinc-950 border-zinc-800 text-white" /></div>
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">Encerramento</Label><Input type="datetime-local" value={form.data_encerramento} onChange={e => setForm(f => ({...f, data_encerramento: e.target.value}))} className="bg-zinc-950 border-zinc-800 text-white" /></div>
            </div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setStep(0)} className="border-zinc-700 text-zinc-300">Voltar</Button><Button onClick={() => setStep(2)} disabled={!form.titulo || !form.uf} className="bg-orange-500 hover:bg-orange-600 text-white">Prximo <ChevronRight className="h-4 w-4 ml-1" /></Button></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <p className="text-zinc-400 text-sm">Selecione os documentos obrigatrios para este evento.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Array.isArray(tmpl?.documentos_padrao) ? tmpl.documentos_padrao : []).map(doc => {
                const on = form.documentos_obrigatorios.includes(doc);
                return <button key={doc} onClick={() => toggleDoc(doc)} className={`flex items-center gap-2 p-3 rounded-xl border text-xs text-left transition-all font-mono ${on ? 'bg-orange-500/15 border-orange-500/40 text-orange-300' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}><div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'}`}>{on && <Check className="h-3 w-3 text-white" />}</div>{doc}</button>;
              })}
            </div>
            <div className="bg-zinc-900/30 rounded-lg p-3 border border-zinc-800"><p className="text-xs text-zinc-500 mb-2">{form.documentos_obrigatorios.length} selecionados</p><div className="flex flex-wrap gap-1">{form.documentos_obrigatorios.map(d => <span key={d} className="text-[10px] bg-orange-500/10 text-orange-300 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">{d}<button onClick={() => toggleDoc(d)}></button></span>)}</div></div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setStep(1)} className="border-zinc-700 text-zinc-300">Voltar</Button><Button onClick={() => setStep(3)} className="bg-orange-500 hover:bg-orange-600 text-white">Prximo <ChevronRight className="h-4 w-4 ml-1" /></Button></div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">Defina as etapas e datas crticas. Os dias so contados a partir da abertura.</p>
            <div className="space-y-2">
              {form.timeline.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0"><span className="text-[10px] font-mono text-orange-400">{i+1}</span></div>
                  <Input value={item.etapa} onChange={e => updateTimeline(i, 'etapa', e.target.value)} className="bg-zinc-950 border-zinc-800 text-white text-sm flex-1 h-8" />
                  <span className="text-xs text-zinc-500">+</span>
                  <Input type="number" value={item.dias_corridos} onChange={e => updateTimeline(i, 'dias_corridos', parseInt(e.target.value)||0)} className="bg-zinc-950 border-zinc-800 text-white text-sm w-16 h-8 text-center" />
                  <span className="text-xs text-zinc-500">dias</span>
                  <button onClick={() => setForm(f => ({...f, timeline: f.timeline.filter((_,idx) => idx !== i)}))} className="text-zinc-600 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={() => setForm(f => ({...f, timeline: [...f.timeline, {etapa: 'Nova Etapa', dias_corridos: 0}]}))} className="border-zinc-700 border-dashed text-zinc-400 w-full"><Plus className="h-4 w-4 mr-2" />Adicionar Etapa</Button>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setStep(2)} className="border-zinc-700 text-zinc-300">Voltar</Button><Button onClick={() => setStep(4)} className="bg-orange-500 hover:bg-orange-600 text-white">Revisar <ChevronRight className="h-4 w-4 ml-1" /></Button></div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">{Icon && <Icon className="h-5 w-5 text-orange-400" />}<CardTitle className="text-lg font-heading">{form.titulo}</CardTitle></div>
                <div className="flex gap-2 mt-2"><Badge className={`${cor?.badge} text-xs font-mono`}>{tmpl?.nome}</Badge><Badge className="bg-blue-500/10 text-blue-400 text-xs font-mono">DETRAN-{form.uf}</Badge></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-400">{form.descricao}</p>
                <div><p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Documentos ({form.documentos_obrigatorios.length})</p><div className="flex flex-wrap gap-1">{form.documentos_obrigatorios.map(d => <span key={d} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">{d}</span>)}</div></div>
                <div><p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Timeline ({form.timeline.length} etapas)</p><div className="space-y-1">{form.timeline.map((t, i) => <div key={i} className="flex items-center gap-2 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" /><span className="text-zinc-300">{t.etapa}</span><span className="text-zinc-600 ml-auto font-mono">+{t.dias_corridos}d</span></div>)}</div></div>
              </CardContent>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="border-zinc-700 text-zinc-300">Voltar</Button>
              <Button onClick={() => handleSalvar(false)} disabled={saving} variant="outline" className="border-zinc-700 text-zinc-300">{saving ? 'Salvando...' : 'Salvar Rascunho'}</Button>
              <Button onClick={() => handleSalvar(true)} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white flex-1"><Globe className="h-4 w-4 mr-2" />{saving ? 'Publicando...' : 'Publicar e Gerar Link'}</Button>
            </div>
          </div>
        )}

        {step === 5 && eventoSalvo && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto"><Check className="h-10 w-10 text-emerald-400" /></div>
            <div><h2 className="text-2xl font-heading font-bold mb-2">{eventoSalvo.status === 'publicado' ? 'Evento Publicado!' : 'Rascunho Salvo!'}</h2><p className="text-zinc-400">{eventoSalvo.titulo}</p></div>
            {eventoSalvo.status === 'publicado' && (
              <Card className="bg-zinc-900/50 border-zinc-800 text-left">
                <CardContent className="p-5">
                  <p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Link para Divulgao no DOU</p>
                  <div className="flex items-center gap-2 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <Globe className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-sm text-zinc-300 flex-1 truncate font-mono">{eventoSalvo.link_publico}</span>
                    <button onClick={copiarLink} className={`p-1.5 rounded-lg transition-all ${copiado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">Compartilhe este link no Dirio Oficial para que as empresas se inscrevam</p>
                </CardContent>
              </Card>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep(0); setForm({template:'',titulo:'',descricao:'',uf:'',orgao:'',data_abertura:'',data_encerramento:'',documentos_obrigatorios:[],timeline:[]}); setEventoSalvo(null); }} className="border-zinc-700 text-zinc-300">Criar Novo</Button>
              <Button onClick={() => navigate('/editais')} className="bg-orange-500 hover:bg-orange-600 text-white">Ver Eventos</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CriarEvento;
