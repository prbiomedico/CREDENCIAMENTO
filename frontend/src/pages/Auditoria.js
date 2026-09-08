import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Search, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '../components/DashboardLayout';
import { AsyncState, EmptyState, PageContainer, PageHeader } from '../design-system';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const texto = (valor) => valor || '—';

const formatarData = (valor) => {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString('pt-BR');
};

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [entidade, setEntidade] = useState('');
  const [entidadeId, setEntidadeId] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const { data } = await axios.get(`${API}/auditoria`, {
        params: {
          limit: 500,
          ...(entidade.trim() ? { entidade: entidade.trim() } : {}),
          ...(entidadeId.trim() ? { entidade_id: entidadeId.trim() } : {}),
        },
      });
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      const mensagem = error.response?.data?.detail || 'Não foi possível carregar o histórico.';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setLoading(false);
    }
  }, [entidade, entidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const logsFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return logs;
    return logs.filter((log) => [
      log.acao, log.entidade, log.entidade_id, log.user_id,
      log.atuando_como_empresa, log.atuando_como_detran,
      JSON.stringify(log.detalhes || {}),
    ].some((valor) => String(valor || '').toLocaleLowerCase('pt-BR').includes(termo)));
  }, [busca, logs]);

  return (
    <DashboardLayout>
      <PageContainer className="space-y-6">
        <PageHeader
          eyebrow="Governança"
          title="Auditoria"
          description="Histórico operacional das alterações realizadas no SIGCR. Os eventos são exibidos do mais recente para o mais antigo."
          actions={(
            <Button variant="outline" onClick={carregar} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          )}
        />

        <section className="border-y border-border bg-card py-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <Input value={entidade} onChange={(e) => setEntidade(e.target.value)} placeholder="Tipo: edital, company…" aria-label="Filtrar por tipo de entidade" />
            <Input value={entidadeId} onChange={(e) => setEntidadeId(e.target.value)} placeholder="ID da entidade" aria-label="Filtrar por ID da entidade" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" placeholder="Buscar nos resultados carregados" aria-label="Buscar nos registros" />
            </div>
            <Button onClick={carregar} disabled={loading}>Aplicar filtros</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{logsFiltrados.length} de {logs.length} eventos exibidos</p>
        </section>

        {loading ? (
          <AsyncState title="Carregando trilha de auditoria…" />
        ) : erro ? (
          <AsyncState type="error" title="Falha ao carregar auditoria" description={erro} action={<Button onClick={carregar}>Tentar novamente</Button>} />
        ) : logsFiltrados.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nenhum evento encontrado" description="Ajuste os filtros ou aguarde novas operações no sistema." />
        ) : (
          <div className="overflow-x-auto border-y border-border bg-card">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Ação</th>
                  <th className="px-4 py-3 font-semibold">Entidade</th>
                  <th className="px-4 py-3 font-semibold">Usuário</th>
                  <th className="px-4 py-3 font-semibold">Contexto</th>
                  <th className="px-4 py-3 font-semibold">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logsFiltrados.map((log, indice) => (
                  <tr key={`${log.created_at}-${log.acao}-${log.entidade_id}-${indice}`} className="align-top hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatarData(log.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{texto(log.acao)}</td>
                    <td className="px-4 py-3">
                      <div>{texto(log.entidade)}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{texto(log.entidade_id)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{texto(log.user_id)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.atuando_como_empresa && <div>Empresa: {log.atuando_como_empresa}</div>}
                      {log.atuando_como_detran && <div>DETRAN: {log.atuando_como_detran}</div>}
                      {!log.atuando_como_empresa && !log.atuando_como_detran && '—'}
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{JSON.stringify(log.detalhes || {}, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContainer>
    </DashboardLayout>
  );
}
