import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ShieldCheck } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import TurnstileWidget from '@/components/TurnstileWidget';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

const emptyForm = () => ({
  tipo_empresa: 'registradora',
  registradora_id: '',
  name: '',
  nome_fantasia: '',
  cnpj: '',
  endereco: '',
  email_comercial: '',
  whatsapp: '',
  gestor_contrato: '',
  password: '',
});

const CadastroPublico = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenPortaria = params.get('portaria') || '';
  const [formData, setFormData] = useState(emptyForm());
  const [confirmSenha, setConfirmSenha] = useState('');
  const [registradoras, setRegistradoras] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [portaria, setPortaria] = useState(null);
  const [portariaErro, setPortariaErro] = useState(false);
  const [cnpjValidado, setCnpjValidado] = useState(null);
  const [validandoCnpj, setValidandoCnpj] = useState(false);
  const handleCaptchaToken = useCallback((token) => setCaptchaToken(token), []);

  useEffect(() => {
    if (!tokenPortaria) return;
    axios.get(`${API}/portarias/publico/${tokenPortaria}`)
      .then(({ data }) => {
        setPortaria(data);
        const perfis = data.perfis_habilitados || [];
        if (perfis.length === 1) setFormData((atual) => ({ ...atual, tipo_empresa: perfis[0] }));
      })
      .catch(() => setPortariaErro(true));
  }, [tokenPortaria]);

  useEffect(() => {
    if (formData.tipo_empresa !== 'financeira') return;
    axios.get(`${API}/public/registradoras`)
      .then((res) => setRegistradoras(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRegistradoras([]));
  }, [formData.tipo_empresa]);

  const validarCnpj = async () => {
    if (!formData.cnpj || !tokenPortaria) return;
    setValidandoCnpj(true);
    setCnpjValidado(null);
    try {
      const { data } = await axios.post(`${API}/public/portarias/${tokenPortaria}/validar-cnpj`, {
        cnpj: formData.cnpj,
        tipo_empresa: formData.tipo_empresa,
      });
      setFormData((atual) => ({ ...atual, cnpj: data.cnpj }));
      setCnpjValidado(data);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Não foi possível validar o CNPJ');
    } finally {
      setValidandoCnpj(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tokenPortaria || !portaria) {
      toast.error('Inicie o cadastro por uma Portaria publicada');
      return;
    }
    if (!cnpjValidado
      || cnpjValidado.cnpj !== formData.cnpj.replace(/\D/g, '')
      || cnpjValidado.tipo_empresa !== formData.tipo_empresa) {
      toast.error('Valide o CNPJ antes de continuar');
      return;
    }
    if (cnpjValidado.empresa_ja_cadastrada) {
      toast.error('Este CNPJ já possui cadastro. Entre com a conta existente.');
      return;
    }
    if (formData.password.length < 8) {
      toast.error('Senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (formData.password !== confirmSenha) {
      toast.error('As senhas não conferem');
      return;
    }
    if (formData.tipo_empresa === 'financeira' && !formData.registradora_id) {
      toast.error('Selecione a registradora à qual sua empresa está vinculada');
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      toast.error('Conclua a verificação anti-robô');
      return;
    }
    setEnviando(true);
    try {
      const payload = { ...formData, token_publico: tokenPortaria, captcha_token: captchaToken || null };
      if (payload.tipo_empresa !== 'financeira') delete payload.registradora_id;
      await axios.post(`${API}/public/cadastro`, payload);
      setConcluido(true);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar cadastro');
    } finally {
      setEnviando(false);
    }
  };

  if (!tokenPortaria || portariaErro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg border-border bg-card">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-accent" />
            <h1 className="text-xl font-bold">Cadastro protegido por Portaria</h1>
            <p className="mt-2 text-sm text-muted-foreground">O cadastro de Financeiras e Registradoras começa pelo edital publicado pelo DETRAN. Nenhum estado pode ser escolhido livremente.</p>
            <Button className="mt-6" onClick={() => navigate('/transparencia')}>Consultar Portarias disponíveis</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!portaria) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Validando Portaria publicada…</div>;
  }

  if (concluido) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Cadastro enviado</h1>
            <p className="text-slate-600 text-sm mb-6">
              Seu cadastro foi recebido e está aguardando aprovação. Você será notificado por e-mail quando o acesso for liberado.
            </p>
            <Button onClick={() => navigate('/')} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <BrandLogo variant="horizontal" className="mb-8 h-16 w-auto" alt="SIGCR" />

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary-400" />
              Cadastro de Empresa
            </CardTitle>
            {portaria && <p className="text-sm text-muted-foreground">DETRAN-{portaria.estado_sigla} · {portaria.title}</p>}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-slate-700">Tipo de Empresa</Label>
                <Select value={formData.tipo_empresa} onValueChange={(value) => { setFormData({ ...formData, tipo_empresa: value, registradora_id: '' }); setCnpjValidado(null); }}>
                  <SelectTrigger className="bg-muted border-input text-foreground mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-input text-foreground">
                    {(portaria?.perfis_habilitados || []).includes('registradora') && <SelectItem value="registradora">Registradora</SelectItem>}
                    {(portaria?.perfis_habilitados || []).includes('financeira') && <SelectItem value="financeira">Financeira</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              {formData.tipo_empresa === 'financeira' && (
                <div>
                  <Label className="text-slate-700">Registradora Vinculada</Label>
                  <Select value={formData.registradora_id} onValueChange={(value) => setFormData({ ...formData, registradora_id: value })}>
                    <SelectTrigger className="bg-muted border-input text-foreground mt-1">
                      <SelectValue placeholder="Selecione a registradora..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-input text-foreground">
                      {registradoras.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Nenhuma registradora disponível</div>
                      ) : (
                        registradoras.map((r) => (
                          <SelectItem key={r.company_id} value={r.company_id}>{r.nome_fantasia}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-700">Razão Social</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-muted border-input text-foreground mt-1" required />
                </div>
                <div>
                  <Label className="text-slate-700">Nome Fantasia</Label>
                  <Input value={formData.nome_fantasia} onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })} className="bg-muted border-input text-foreground mt-1" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-700">CNPJ</Label>
                  <Input value={formData.cnpj} onChange={(e) => { setFormData({ ...formData, cnpj: e.target.value }); setCnpjValidado(null); }} onBlur={validarCnpj} className="bg-muted border-input text-foreground mt-1" required />
                  <p className={`mt-1 text-xs ${cnpjValidado?.empresa_ja_cadastrada ? 'text-amber-700' : 'text-muted-foreground'}`}>
                    {validandoCnpj ? 'Validando CNPJ...' : cnpjValidado?.empresa_ja_cadastrada ? 'CNPJ já cadastrado — utilize o login existente.' : cnpjValidado ? 'CNPJ válido para esta Portaria.' : 'A validação é obrigatória antes do envio.'}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-700">WhatsApp</Label>
                  <Input value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} placeholder="(00) 00000-0000" className="bg-muted border-input text-foreground mt-1" required />
                </div>
              </div>

              <div>
                <Label className="text-slate-700">Endereço</Label>
                <Input value={formData.endereco} onChange={(e) => setFormData({ ...formData, endereco: e.target.value })} className="bg-muted border-input text-foreground mt-1" required />
              </div>

              <div>
                <Label className="text-slate-700">Nome do Gestor de Contrato</Label>
                <Input value={formData.gestor_contrato} onChange={(e) => setFormData({ ...formData, gestor_contrato: e.target.value })} className="bg-muted border-input text-foreground mt-1" required />
              </div>

              <div className="rounded-md border border-accent/25 bg-accent/5 p-3 text-sm text-foreground">
                Estado vinculado automaticamente: <strong>DETRAN-{portaria?.estado_sigla}</strong>. Estados adicionais dependem do escopo contratado.
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-slate-700">E-mail de Acesso</Label>
                <Input type="email" value={formData.email_comercial} onChange={(e) => setFormData({ ...formData, email_comercial: e.target.value })} className="bg-muted border-input text-foreground mt-1" required />
                <p className="text-xs text-slate-500 mt-1">Esse e-mail também será usado pra você entrar no sistema.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-700">Senha</Label>
                  <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="bg-muted border-input text-foreground mt-1" required minLength={8} />
                </div>
                <div>
                  <Label className="text-slate-700">Confirmar Senha</Label>
                  <Input type="password" value={confirmSenha} onChange={(e) => setConfirmSenha(e.target.value)} className="bg-muted border-input text-foreground mt-1" required minLength={8} />
                </div>
              </div>

              <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={handleCaptchaToken} />

              <Button type="submit" disabled={enviando} className="bg-primary-500 hover:bg-primary-600 text-white w-full">
                {enviando ? 'Enviando...' : 'Cadastrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CadastroPublico;
