import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, FileText, Calendar, ListChecks, ArrowRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Preview público (sem login) de uma portaria publicada pelo wizard "Criar
// Evento" — destino do link compartilhado no Diário Oficial. Quem já tem
// cadastro cai direto no fluxo real de submissão (/credenciamento-portaria,
// que exige login — RotaProtegida cuida do redirect pro Keycloak); quem não
// tem, vai pro cadastro público.
const PortariaPublica = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [portaria, setPortaria] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    axios.get(`${API}/portarias/publico/${token}`)
      .then((r) => setPortaria(r.data))
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-white">
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Shield className="h-7 w-7 text-sky-500" />
          <span className="text-xl font-bold tracking-tight">SIGCR</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : erro || !portaria ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mb-4" />
              <p className="text-zinc-400 font-medium">Este link não é válido ou o evento não está mais disponível.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex gap-2 mb-3">
                {portaria.estado_sigla && (
                  <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-mono text-xs">DETRAN-{portaria.estado_sigla}</Badge>
                )}
                {portaria.tipo && (
                  <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-mono text-xs">{portaria.tipo}</Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold mb-2">{portaria.title}</h1>
              {portaria.summary && <p className="text-zinc-400 text-sm">{portaria.summary}</p>}
              {portaria.publicado_at && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-3">
                  <Calendar className="h-3.5 w-3.5" />
                  Publicado em {new Date(portaria.publicado_at).toLocaleDateString('pt-BR')}
                </div>
              )}
            </div>

            {Array.isArray(portaria.checklist_itens) && portaria.checklist_itens.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3 text-sm font-mono uppercase text-zinc-500">
                    <ListChecks className="h-4 w-4" />
                    Documentação exigida ({portaria.checklist_itens.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {portaria.checklist_itens.map((item, i) => (
                      <span key={item.catalogo_item_id || i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded font-mono">
                        {item.nome}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(portaria.data_abertura || portaria.data_encerramento) && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <p className="text-sm font-mono uppercase text-zinc-500 mb-2">Prazo</p>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Calendar className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>
                      {portaria.data_abertura ? new Date(portaria.data_abertura).toLocaleDateString('pt-BR') : '—'}
                      {' até '}
                      {portaria.data_encerramento ? new Date(portaria.data_encerramento).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-sky-500/5 border-sky-500/20">
              <CardContent className="p-5 space-y-3">
                <p className="text-sm text-zinc-300">Pra participar, sua empresa precisa estar cadastrada no SIGCR.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={() => navigate('/credenciamento-portaria')} className="bg-primary hover:bg-primary/90 text-white gap-2 flex-1">
                    Já tenho cadastro — enviar documentação <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => navigate('/cadastro')} variant="outline" className="gap-2 flex-1">
                    <UserPlus className="h-4 w-4" />
                    Cadastrar minha empresa
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortariaPublica;
