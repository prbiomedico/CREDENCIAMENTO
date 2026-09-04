import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Plus, Shield, Zap, Users, Copy, Check, ChevronRight, Globe, Lock, Loader2, Paperclip } from 'lucide-react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChecklistCatalogoPicker from '../components/ChecklistCatalogoPicker';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const STEPS = ['Template','Detalhes','Documentos','Revisar'];

// Só "credenciamento" está de fato integrado ao fluxo real (Portaria +
// catálogo de checklist + submissões). Os demais seguem na tela como
// vitrine do que vem a seguir, mas não criam nada de verdade ainda.
const TEMPLATES_DISPONIVEIS = ['credenciamento'];

const ICONS = { credenciamento: Shield, licitacao: Shield, dispensa: Zap, chamamento: Users };
const CORES = {
  credenciamento: { ativo: 'bg-primary-500/20 border-primary-500/50', inativo: 'bg-card border-border', badge: 'bg-primary-500/10 text-primary-400' },
  licitacao: { ativo: 'bg-sky-500/20 border-sky-500/50', inativo: 'bg-card border-border', badge: 'bg-sky-500/10 text-sky-400' },
  dispensa: { ativo: 'bg-emerald-500/20 border-emerald-500/50', inativo: 'bg-card border-border', badge: 'bg-emerald-500/10 text-emerald-400' },
  chamamento: { ativo: 'bg-secondary-500/20 border-secondary-500/50', inativo: 'bg-card border-border', badge: 'bg-secondary-500/10 text-secondary-400' },
};

const formInicial = () => ({
  template: '', titulo: '', descricao: '', uf: '', orgao: '',
  data_abertura: '', data_encerramento: '', checklist_itens: [],
  querido_diario_url: '',
});

const formatarData = (v) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;

const CriarEvento = () => {
  const { user, initialized } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventoSalvo, setEventoSalvo] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [form, setForm] = useState(formInicial());
  const [pdfFile, setPdfFile] = useState(null);
  const prefillAplicado = useRef(false);

  useEffect(() => { if (!initialized || !user) return; fetchTemplates(); }, [initialized, user]);

  const fetchTemplates = async () => {
    try { const r = await axios.get(`${API}/eventos/templates`); setTemplates(r.data); }
    catch { toast.error('Erro ao carregar templates'); }
    finally { setLoading(false); }
  };

  // Deep-link vindo do "Promover" do Querido Diário (em Portarias.js): já
  // chega com template=credenciamento implícito, pré-preenche o passo
  // Detalhes e pula direto pra lá — o usuário revisa e segue o wizard normal.
  useEffect(() => {
    if (prefillAplicado.current) return;
    if (Object.keys(templates).length === 0) return;
    if ([...searchParams.keys()].length === 0) { prefillAplicado.current = true; return; }
    prefillAplicado.current = true;
    const t = templates['credenciamento'];
    setForm((f) => ({
      ...f,
      template: 'credenciamento',
      titulo: searchParams.get('titulo') || f.titulo,
      descricao: searchParams.get('descricao') || t?.descricao || f.descricao,
      uf: (searchParams.get('uf') || '').toUpperCase() || f.uf,
      data_abertura: searchParams.get('data_abertura') || f.data_abertura,
      querido_diario_url: searchParams.get('querido_diario_url') || '',
    }));
    setStep(1);
  }, [templates, searchParams]);

  const selecionarTemplate = (key) => {
    if (!TEMPLATES_DISPONIVEIS.includes(key)) {
      toast.info('Este template ainda não está disponível.');
      return;
    }
    const t = templates[key];
    setForm((f) => ({ ...f, template: key, descricao: t.descricao }));
    setStep(1);
  };

  const toggleChecklistItem = (catalogItem) => {
    setForm((f) => {
      const existe = f.checklist_itens.some((i) => i.catalogo_item_id === catalogItem.item_id);
      return {
        ...f,
        checklist_itens: existe
          ? f.checklist_itens.filter((i) => i.catalogo_item_id !== catalogItem.item_id)
          : [...f.checklist_itens, {
              nome: catalogItem.nome, descricao: catalogItem.descricao,
              perfil_alvo: catalogItem.perfil_alvo, catalogo_item_id: catalogItem.item_id,
            }],
      };
    });
  };

  const handleSalvar = async (publicar = false) => {
    if (!form.titulo || !form.uf) { toast.error('Preencha título e UF'); setStep(1); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.titulo,
        summary: form.descricao,
        estado_sigla: form.uf,
        orgao_emissor: form.orgao,
        tipo: form.template,
        template: form.template,
        criado_via: 'wizard',
        origem: form.querido_diario_url ? 'querido_diario' : 'manual',
        querido_diario_url: form.querido_diario_url || null,
        checklist_itens: form.checklist_itens,
        data_abertura: form.data_abertura ? new Date(form.data_abertura).toISOString() : null,
        data_encerramento: form.data_encerramento ? new Date(form.data_encerramento).toISOString() : null,
      };
      const res = await axios.post(`${API}/portarias`, payload, { withCredentials: true });
      let portaria = res.data;
      if (pdfFile) {
        try {
          const fd = new FormData();
          fd.append('file', pdfFile);
          const pdfRes = await axios.post(`${API}/portarias/${portaria.portaria_id}/pdf`, fd, {
            withCredentials: true,
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          portaria = pdfRes.data;
        } catch (pdfError) {
          toast.error(pdfError?.response?.data?.detail || 'Evento salvo, mas o PDF não pôde ser anexado — anexe depois em Transparência > Editar');
        }
      }
      if (publicar) {
        const pubRes = await axios.patch(`${API}/portarias/${portaria.portaria_id}/publicar`, {}, { withCredentials: true });
        portaria = pubRes.data;
        toast.success('Evento publicado!');
      } else {
        toast.success('Rascunho salvo!');
      }
      setEventoSalvo({
        portaria_id: portaria.portaria_id,
        titulo: portaria.title,
        link_publico: portaria.link_publico,
        status: publicar ? 'publicado' : 'rascunho',
      });
      setStep(4);
    } catch (e) { toast.error(e.response?.data?.detail || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const copiarLink = () => { navigator.clipboard.writeText(eventoSalvo?.link_publico || ''); setCopiado(true); setTimeout(() => setCopiado(false), 2000); toast.success('Link copiado!'); };

  const tmpl = templates[form.template];
  const cor = CORES[form.template];
  const Icon = ICONS[form.template];
  const selecionadosCatalogo = new Set(form.checklist_itens.filter((i) => i.catalogo_item_id).map((i) => i.catalogo_item_id));

  if (loading) return <DashboardLayout><div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center"><Plus className="h-5 w-5 text-primary-500" /></div>
            <div><h1 className="text-3xl font-heading font-bold">Criar Evento</h1><p className="text-zinc-500 text-sm">Configure um novo processo</p></div>
          </div>
          {step < 4 && (
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <React.Fragment key={i}>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all ${i === step ? 'bg-primary-500 text-white' : i < step ? 'bg-primary-500/20 text-primary-400' : 'bg-zinc-800 text-zinc-500'}`}>{i+1} <span className="hidden sm:inline">{s}</span></div>
                  {i < STEPS.length-1 && <div className={`h-px flex-1 ${i < step ? 'bg-primary-500/40' : 'bg-zinc-800'}`} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {step === 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(templates).map(([key, t]) => {
              const c = CORES[key]; const I = ICONS[key];
              const disponivel = TEMPLATES_DISPONIVEIS.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => selecionarTemplate(key)}
                  className={`relative p-6 rounded-2xl border-2 text-left transition-all ${disponivel ? 'hover:scale-[1.02]' : 'opacity-50 cursor-default'} ${c.inativo}`}
                >
                  {!disponivel && (
                    <Badge className="absolute top-4 right-4 bg-zinc-800 text-zinc-400 border-input text-[10px] gap-1">
                      <Lock className="h-2.5 w-2.5" /> Em breve
                    </Badge>
                  )}
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
            <div><Label className="text-zinc-300 text-sm mb-1.5 block">Título *</Label><Input value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} className="bg-background border-border focus:border-primary-500 text-white" placeholder="Ex: Credenciamento de Registradoras DF 2026" /></div>
            <div><Label className="text-zinc-300 text-sm mb-1.5 block">Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} className="bg-background border-border text-white min-h-[80px]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">UF *</Label>
                <Select value={form.uf} onValueChange={v => setForm(f => ({...f, uf: v, orgao: `DETRAN-${v}`}))}>
                  <SelectTrigger className="bg-background border-border text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-white">{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">Órgão</Label><Input value={form.orgao} onChange={e => setForm(f => ({...f, orgao: e.target.value}))} className="bg-background border-border text-white" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">Abertura</Label><Input type="datetime-local" value={form.data_abertura} onChange={e => setForm(f => ({...f, data_abertura: e.target.value}))} className="bg-background border-border text-white" /></div>
              <div><Label className="text-zinc-300 text-sm mb-1.5 block">Encerramento</Label><Input type="datetime-local" value={form.data_encerramento} onChange={e => setForm(f => ({...f, data_encerramento: e.target.value}))} className="bg-background border-border text-white" /></div>
            </div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setStep(0)}>Voltar</Button><Button onClick={() => setStep(2)} disabled={!form.titulo || !form.uf} className="bg-primary-500 hover:bg-primary-600 text-white">Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <p className="text-zinc-400 text-sm">Selecione os itens do catálogo de checklist exigidos para este evento — os mesmos usados pela conferência do DETRAN e pelas submissões das empresas.</p>
            <ChecklistCatalogoPicker selecionados={selecionadosCatalogo} onToggle={toggleChecklistItem} />
            <div className="bg-muted/40 rounded-lg p-3 border border-border"><p className="text-xs text-zinc-500 mb-2">{form.checklist_itens.length} selecionado(s)</p><div className="flex flex-wrap gap-1">{form.checklist_itens.map(d => <span key={d.catalogo_item_id || d.nome} className="text-[10px] bg-primary-500/10 text-primary-300 px-2 py-0.5 rounded-full font-mono">{d.nome}</span>)}</div></div>
            <div className="flex gap-3"><Button variant="outline" onClick={() => setStep(1)}>Voltar</Button><Button onClick={() => setStep(3)} className="bg-primary-500 hover:bg-primary-600 text-white">Revisar <ChevronRight className="h-4 w-4 ml-1" /></Button></div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">{Icon && <Icon className="h-5 w-5 text-primary-400" />}<CardTitle className="text-lg font-heading">{form.titulo}</CardTitle></div>
                <div className="flex gap-2 mt-2"><Badge className={`${cor?.badge} text-xs font-mono`}>{tmpl?.nome}</Badge><Badge className="bg-sky-500/10 text-sky-400 text-xs font-mono">DETRAN-{form.uf}</Badge></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-400">{form.descricao}</p>
                <div><p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Checklist ({form.checklist_itens.length})</p><div className="flex flex-wrap gap-1">{form.checklist_itens.map(d => <span key={d.catalogo_item_id || d.nome} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">{d.nome}</span>)}</div></div>
                <div><p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Prazo</p><p className="text-sm text-zinc-300">{formatarData(form.data_abertura) || formatarData(form.data_encerramento) ? `${formatarData(form.data_abertura) || '—'} até ${formatarData(form.data_encerramento) || '—'}` : 'Não definido'}</p></div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-mono uppercase">PDF da Portaria (opcional)</p>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="bg-background border-border text-white"
                  />
                  {pdfFile && (
                    <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5"><Paperclip className="h-3 w-3" /> {pdfFile.name}</p>
                  )}
                  <p className="text-xs text-zinc-600 mt-1.5">Pode ser anexado depois em Transparência {'>'} Editar, se preferir.</p>
                </div>
              </CardContent>
            </Card>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={() => handleSalvar(false)} disabled={saving} variant="outline">{saving ? 'Salvando...' : 'Salvar Rascunho'}</Button>
              <Button onClick={() => handleSalvar(true)} disabled={saving} className="bg-primary-500 hover:bg-primary-600 text-white flex-1">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}{saving ? 'Publicando...' : 'Publicar e Gerar Link'}</Button>
            </div>
          </div>
        )}

        {step === 4 && eventoSalvo && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto"><Check className="h-10 w-10 text-emerald-400" /></div>
            <div><h2 className="text-2xl font-heading font-bold mb-2">{eventoSalvo.status === 'publicado' ? 'Evento Publicado!' : 'Rascunho Salvo!'}</h2><p className="text-zinc-400">{eventoSalvo.titulo}</p></div>
            {eventoSalvo.status === 'publicado' && (
              <Card className="bg-card border-border text-left">
                <CardContent className="p-5">
                  <p className="text-xs text-zinc-500 mb-2 font-mono uppercase">Link para Divulgação no DOU</p>
                  <div className="flex items-center gap-2 p-3 bg-background rounded-lg border border-border">
                    <Globe className="h-4 w-4 text-primary-500 shrink-0" />
                    <span className="text-sm text-zinc-300 flex-1 truncate font-mono">{eventoSalvo.link_publico}</span>
                    <button onClick={copiarLink} className={`p-1.5 rounded-lg transition-all ${copiado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">Compartilhe este link no Diário Oficial para que as empresas se inscrevam</p>
                </CardContent>
              </Card>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => { setStep(0); setForm(formInicial()); setEventoSalvo(null); setPdfFile(null); }}>Criar Novo</Button>
              <Button onClick={() => navigate('/portarias')} className="bg-primary-500 hover:bg-primary-600 text-white">Ver Eventos</Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CriarEvento;
