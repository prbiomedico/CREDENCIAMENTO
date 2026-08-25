import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Shield, ShieldCheck, ShieldAlert, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const SEMAFORO_CFG = {
  verde: { label: 'Compliance em dia', cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle },
  amarelo: { label: 'Documentos vencendo', cor: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', Icon: Clock },
  vermelho: { label: 'Documentos vencidos', cor: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', Icon: AlertCircle },
};

export default function SeloPublico() {
  const { companyId } = useParams();
  const [selo, setSelo] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    axios.get(`${API}/api/public/selo/${companyId}`)
      .then(({ data }) => setSelo(data))
      .catch((e) => setErro(e?.response?.status === 404 ? 'Empresa não encontrada.' : 'Não foi possível verificar o selo agora.'));
  }, [companyId]);

  if (erro) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div data-testid="selo-erro" className="text-center text-zinc-400">
          <ShieldAlert className="h-10 w-10 text-red-400 mx-auto mb-3" />
          {erro}
        </div>
      </div>
    );
  }

  if (!selo) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  const sem = SEMAFORO_CFG[selo.semaforo] || SEMAFORO_CFG.verde;
  const SemIcon = sem.Icon;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30"></div>
      <div className="relative z-10 w-full max-w-md">
        <div data-testid="selo-card" className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 border ${selo.credenciada ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-800 border-zinc-700'}`}>
            {selo.credenciada
              ? <ShieldCheck className="h-10 w-10 text-emerald-400" />
              : <Shield className="h-10 w-10 text-zinc-400" />}
          </div>

          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Selo público SIGCR</p>
          <h1 data-testid="selo-nome" className="text-2xl font-heading font-bold text-white mb-1">{selo.nome_fantasia}</h1>
          <p className="text-zinc-500 text-sm font-mono mb-4">CNPJ {selo.cnpj_mascarado} · {selo.tipo_empresa === 'financeira' ? 'Financeira' : 'Registradora'}</p>

          <div data-testid="selo-status" className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold mb-6 ${selo.credenciada ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
            {selo.credenciada ? 'CREDENCIADA' : 'CREDENCIAMENTO EM ANÁLISE'}
          </div>

          <div data-testid="selo-semaforo" className={`rounded-xl border p-4 mb-6 ${sem.bg}`}>
            <SemIcon className={`h-6 w-6 mx-auto mb-1 ${sem.cor}`} />
            <p className={`text-sm font-semibold ${sem.cor}`}>{sem.label}</p>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              {selo.documentos.validos} em dia · {selo.documentos.vencendo} vencendo · {selo.documentos.vencidos} vencidos
            </p>
          </div>

          {selo.detrans_atuacao?.length > 0 && (
            <p className="text-xs text-zinc-500 mb-4">Atuação: {selo.detrans_atuacao.join(', ')}</p>
          )}

          <p className="text-[10px] text-zinc-600 font-mono">
            Verificado em {new Date(selo.verificado_em).toLocaleString('pt-BR')} · sigcr.com.br
          </p>
        </div>
      </div>
    </div>
  );
}
