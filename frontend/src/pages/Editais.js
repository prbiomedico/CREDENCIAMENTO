import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Folder, Plus, Calendar, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const STATUS_EDITAL = {
  aberto: { label: 'Aberto', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle },
  em_analise: { label: 'Em Análise', bg: 'bg-primary-500/10', text: 'text-primary-400', icon: Clock },
  encerrado: { label: 'Encerrado', bg: 'bg-zinc-800', text: 'text-zinc-400', icon: XCircle },
};

const Editais = () => {
  const [editais, setEditais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUF, setFiltroUF] = useState('todos');
  const navigate = useNavigate();

  const { user, initialized, getToken } = useAuth();

  useEffect(() => { if (!initialized || !user) return; fetchEditais(); }, [initialized, user]);

  const fetchEditais = async () => {
    try { await getToken(); } catch {}
    try {
      const res = await axios.get(`${API}/editais`);
      setEditais(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error('Erro ao carregar editais'); }
    finally { setLoading(false); }
  };

  const handleCandidatar = async (edital) => {
    try {
      const companies = await axios.get(`${API}/companies`);
      if (!companies.data.length) {
        toast.error('Cadastre uma empresa primeiro');
        navigate('/registradoras-empresa');
        return;
      }
      await axios.post(`${API}/solicitacoes`, {
        edital_id: edital.edital_id,
        company_id: companies.data[0].company_id,
        uf: edital.uf
      });
      toast.success('Candidatura realizada! Veja em Solicitações.');
      navigate('/solicitacoes');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao candidatar');
    }
  };

  const editaisFiltrados = filtroUF === 'todos' ? editais : editais.filter(e => e.uf === filtroUF);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
              <Folder className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold tracking-tight">Editais</h1>
              <p className="text-zinc-500 text-sm">Processos de credenciamento abertos pelos DETRANs</p>
            </div>
          </div>
          <Select value={filtroUF} onValueChange={setFiltroUF}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
              <SelectItem value="todos">Todos</SelectItem>
              {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : editaisFiltrados.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Folder className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400">Nenhum edital encontrado</p>
              <p className="text-sm text-zinc-600 mt-1">Aguarde editais dos DETRANs</p>
            </CardContent>
          </Card>
        ) : (
          // Lista de editais — BentoGrid, 2 cards por linha via size="2x1"
          // (Fase 4, PENDING_ACTIONS.md item 38): cards uniformes o bastante
          // (descrição já truncada em 2 linhas) pra ganhar em escaneabilidade
          // lado a lado em vez de empilhados. interactive=true porque cada
          // card tem uma ação real ("Candidatar-se"), diferente dos tiles de
          // métrica do Dashboard, que são só leitura.
          <BentoGrid>
            {editaisFiltrados.map((edital) => {
              const cfg = STATUS_EDITAL[edital.status] || STATUS_EDITAL.encerrado;
              const Icon = cfg.icon;
              const dias = Math.ceil((new Date(edital.data_encerramento) - new Date()) / (1000*60*60*24));
              return (
                <BentoCard key={edital.edital_id} size="2x1" interactive className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="p-6 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">DETRAN-{edital.uf}</Badge>
                      <Badge className={`${cfg.bg} ${cfg.text} text-xs font-mono`}>
                        <Icon className="h-3 w-3 mr-1" />{cfg.label}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">{edital.titulo}</h3>
                    <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{edital.descricao}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Encerra {new Date(edital.data_encerramento).toLocaleDateString('pt-BR')}</span>
                      {edital.status === 'aberto' && dias > 0 && (
                        <span className={`font-mono font-semibold ${dias <= 7 ? 'text-red-400' : dias <= 15 ? 'text-primary-400' : 'text-zinc-400'}`}>{dias} dias restantes</span>
                      )}
                    </div>
                    {edital.status === 'aberto' && (
                      <Button onClick={() => handleCandidatar(edital)} className="bg-primary-500 hover:bg-primary-600 text-white text-sm h-9 px-4 mt-auto self-start">
                        Candidatar-se <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </CardContent>
                </BentoCard>
              );
            })}
          </BentoGrid>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Editais;
