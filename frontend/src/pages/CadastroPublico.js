import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

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
  detrans_atuacao: [],
  password: '',
});

const CadastroPublico = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(emptyForm());
  const [confirmSenha, setConfirmSenha] = useState('');
  const [registradoras, setRegistradoras] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (formData.tipo_empresa !== 'financeira') return;
    axios.get(`${API}/public/registradoras`)
      .then((res) => setRegistradoras(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRegistradoras([]));
  }, [formData.tipo_empresa]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    setEnviando(true);
    try {
      const payload = { ...formData };
      if (payload.tipo_empresa !== 'financeira') delete payload.registradora_id;
      await axios.post(`${API}/public/cadastro`, payload);
      setConcluido(true);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao enviar cadastro');
    } finally {
      setEnviando(false);
    }
  };

  const toggleDetran = (uf) => {
    setFormData((p) => ({
      ...p,
      detrans_atuacao: p.detrans_atuacao.includes(uf) ? p.detrans_atuacao.filter((d) => d !== uf) : [...p.detrans_atuacao, uf],
    }));
  };

  if (concluido) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <Card className="bg-zinc-900/50 border-zinc-800 max-w-md w-full">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Cadastro enviado</h1>
            <p className="text-zinc-400 text-sm mb-6">
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
    <div className="min-h-screen bg-zinc-950 text-white py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary-500/10 border border-primary-500/20 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <span className="text-lg font-heading font-bold block leading-none">sigcr</span>
            <span className="text-xs text-primary-500 font-mono font-bold">SIGCR</span>
          </div>
        </div>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary-400" />
              Cadastro de Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-zinc-300">Tipo de Empresa</Label>
                <Select value={formData.tipo_empresa} onValueChange={(value) => setFormData({ ...formData, tipo_empresa: value, registradora_id: '' })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                    <SelectItem value="registradora">Registradora</SelectItem>
                    <SelectItem value="financeira">Financeira</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tipo_empresa === 'financeira' && (
                <div>
                  <Label className="text-zinc-300">Registradora Vinculada</Label>
                  <Select value={formData.registradora_id} onValueChange={(value) => setFormData({ ...formData, registradora_id: value })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                      <SelectValue placeholder="Selecione a registradora..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                      {registradoras.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-zinc-500">Nenhuma registradora disponível</div>
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
                  <Label className="text-zinc-300">Razão Social</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
                <div>
                  <Label className="text-zinc-300">Nome Fantasia</Label>
                  <Input value={formData.nome_fantasia} onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-300">CNPJ</Label>
                  <Input value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
                <div>
                  <Label className="text-zinc-300">WhatsApp</Label>
                  <Input value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} placeholder="(00) 00000-0000" className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                </div>
              </div>

              <div>
                <Label className="text-zinc-300">Endereço</Label>
                <Input value={formData.endereco} onChange={(e) => setFormData({ ...formData, endereco: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
              </div>

              <div>
                <Label className="text-zinc-300">Nome do Gestor de Contrato</Label>
                <Input value={formData.gestor_contrato} onChange={(e) => setFormData({ ...formData, gestor_contrato: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
              </div>

              <div>
                <Label className="text-zinc-300 mb-2 block">DETRANs de Atuação</Label>
                <div className="grid grid-cols-5 gap-2 max-h-32 overflow-y-auto p-3 bg-zinc-800 border border-zinc-700 rounded-md">
                  {UFS.map((uf) => (
                    <label key={uf} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={formData.detrans_atuacao.includes(uf)} onChange={() => toggleDetran(uf)} className="rounded border-zinc-600" />
                      {uf}
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <Label className="text-zinc-300">E-mail de Acesso</Label>
                <Input type="email" value={formData.email_comercial} onChange={(e) => setFormData({ ...formData, email_comercial: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required />
                <p className="text-xs text-zinc-500 mt-1">Esse e-mail também será usado pra você entrar no sistema.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-300">Senha</Label>
                  <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white mt-1" required minLength={8} />
                </div>
                <div>
                  <Label className="text-zinc-300">Confirmar Senha</Label>
                  <Input type="password" value={confirmSenha} onChange={(e) => setConfirmSenha(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white mt-1" required minLength={8} />
                </div>
              </div>

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
