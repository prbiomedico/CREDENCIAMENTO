import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, FileText, Download, Calendar, Paperclip, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function Transparencia() {
  const { uf } = useParams();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!uf) return;
    setLoading(true);
    setErro(null);
    axios.get(`${API}/public/editais/${uf}`)
      .then(res => setDados(res.data))
      .catch(() => setErro('Não foi possível carregar os editais deste estado.'))
      .finally(() => setLoading(false));
  }, [uf]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <Shield className="h-7 w-7 text-primary-500" />
            <span className="text-xl font-bold tracking-tight">SIGCR</span>
            <span className="text-zinc-500 text-sm font-mono ml-1">/ Transparência</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Editais de Credenciamento</h1>
          <p className="text-zinc-500 text-sm">
            Consulta pública dos editais vigentes de credenciamento de registradoras e financeiras por estado. Nenhum login é necessário.
          </p>
        </div>

        <div className="mb-8 max-w-xs">
          <label className="text-xs text-zinc-400 font-mono uppercase tracking-wider mb-2 block">Selecione o estado</label>
          <Select value={uf || ''} onValueChange={(v) => navigate(`/transparencia/${v}`)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
              <SelectValue placeholder="Escolha uma UF" />
            </SelectTrigger>
            <SelectContent>
              {UFS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!uf && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400">Selecione um estado acima para ver os editais vigentes</p>
            </CardContent>
          </Card>
        )}

        {uf && loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {uf && !loading && erro && (
          <Card className="bg-red-950/30 border-red-900">
            <CardContent className="p-8 text-center text-red-400">{erro}</CardContent>
          </Card>
        )}

        {uf && !loading && !erro && dados && (
          <>
            <h2 className="text-sm font-mono uppercase tracking-wider text-zinc-500 mb-4">
              {dados.uf_nome} ({dados.uf})
            </h2>
            {dados.editais.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-400">Nenhum edital vigente neste estado no momento</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {dados.editais.map(e => (
                  <Card key={e.edital_id} className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{e.titulo}</h3>
                          {e.descricao && <p className="text-sm text-zinc-400 mt-1">{e.descricao}</p>}
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Aberto</Badge>
                      </div>

                      {e.data_encerramento && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-3">
                          <Calendar className="h-3.5 w-3.5" />
                          Encerra em {new Date(e.data_encerramento).toLocaleDateString('pt-BR')}
                        </div>
                      )}

                      {e.documentos_obrigatorios?.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Documentos exigidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {e.documentos_obrigatorios.map((d, i) => (
                              <Badge key={i} className="bg-zinc-800 text-zinc-300 border-zinc-700 text-xs">{d}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                        {e.termo_adesao_download_url && (
                          <a href={`${BACKEND_URL}${e.termo_adesao_download_url}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
                              <Download className="h-3.5 w-3.5 mr-2" /> Termo de Adesão
                            </Button>
                          </a>
                        )}
                        {e.anexos.map((a, i) => (
                          <a key={i} href={`${BACKEND_URL}${a.download_url}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white">
                              <Paperclip className="h-3.5 w-3.5 mr-2" /> {a.nome}
                            </Button>
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-10">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-zinc-500 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao início
          </Button>
        </div>
      </div>
    </div>
  );
}
