import React, { useCallback, useState } from 'react';
import axios from 'axios';
import { Check, Mail, Send, ShieldCheck } from 'lucide-react';
import TurnstileWidget from '@/components/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

const entregas = [
  'Diagnóstico da operação e dos estados de interesse',
  'Acordo de confidencialidade antes da análise detalhada',
  'Escopo de gestão construído conforme a necessidade real',
  'Proposta comercial individual e formalização contratual',
  'Implantação segura, auditável e acompanhada pela equipe SIGCR',
];

export default function Planos() {
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', website: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState('');
  const handleCaptchaToken = useCallback((token) => setCaptchaToken(token), []);

  const enviar = async (event) => {
    event.preventDefault();
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setErro('Conclua a verificação anti-robô.');
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      await axios.post(`${API}/public/contato-comercial`, { ...form, captcha_token: captchaToken || null });
      setConcluido(true);
    } catch (error) {
      setErro(error?.response?.data?.detail || 'Não foi possível enviar sua solicitação. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-5 py-12 lg:py-16">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-accent">Atendimento consultivo</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Primeiro entendemos sua operação. Depois construímos a solução.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Credenciamento envolve estratégia, documentos sensíveis e particularidades estaduais. Por isso, o SIGCR inicia cada relacionamento com uma conversa e protege as informações antes de elaborar o escopo comercial.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.92fr]">
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold text-accent"><ShieldCheck className="h-4 w-4" /> Processo SIGCR</div>
              <CardTitle className="pt-2">Uma proposta construída com responsabilidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {entregas.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10"><Check className="h-3.5 w-3.5 text-accent" /></span>
                  <span>{item}</span>
                </div>
              ))}
              <div className="mt-6 rounded-lg border border-border bg-secondary/45 p-4 text-sm text-muted-foreground">
                Valores, estados contratados e condições operacionais são apresentados somente após o diagnóstico e a formalização da confidencialidade.
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent/35 bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-semibold text-accent"><Mail className="h-4 w-4" /> contato@sigcr.com.br</div>
              <CardTitle className="pt-2">Vamos conversar?</CardTitle>
              <p className="text-sm text-muted-foreground">Deixe seus dados e nossa equipe entrará em contato para agendar a reunião inicial.</p>
            </CardHeader>
            <CardContent>
              {concluido ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900" role="status">
                  <p className="font-bold">Solicitação recebida.</p>
                  <p className="mt-1">Nossa equipe entrará em contato pelos dados informados.</p>
                </div>
              ) : (
                <form onSubmit={enviar} className="space-y-4">
                  <div>
                    <Label htmlFor="contato-nome">Nome</Label>
                    <Input id="contato-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={3} maxLength={120} className="mt-1" autoComplete="name" />
                  </div>
                  <div>
                    <Label htmlFor="contato-email">E-mail</Label>
                    <Input id="contato-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="mt-1" autoComplete="email" />
                  </div>
                  <div>
                    <Label htmlFor="contato-telefone">Telefone</Label>
                    <Input id="contato-telefone" type="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required minLength={10} maxLength={30} placeholder="(00) 00000-0000" className="mt-1" autoComplete="tel" />
                  </div>
                  <div className="hidden" aria-hidden="true">
                    <Label htmlFor="contato-website">Website</Label>
                    <Input id="contato-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                  </div>
                  <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={handleCaptchaToken} />
                  {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
                  <Button type="submit" disabled={enviando} className="w-full gap-2">
                    {enviando ? 'Enviando…' : <><Send className="h-4 w-4" /> Solicitar contato</>}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
