import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, Eye, Calendar, Paperclip, ArrowLeft, LockKeyhole, LogIn, UserPlus } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function Transparencia() {
  const { uf } = useParams();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [preview, setPreview] = useState(null);

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
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <BrandLogo variant="horizontal" className="h-10 w-auto brightness-0 invert" alt="SIGCR" />
            <span className="text-slate-500 text-sm font-mono ml-1">/ Transparência</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Editais de Credenciamento</h1>
          <p className="text-slate-500 text-sm">
            Consulte os editais vigentes por estado e visualize gratuitamente a primeira página. O conteúdo integral é exclusivo para contas habilitadas.
          </p>
        </div>

        <div className="mb-8 max-w-xs">
          <label className="text-xs text-slate-600 font-mono uppercase tracking-wider mb-2 block">Selecione o estado</label>
          <Select value={uf || ''} onValueChange={(v) => navigate(`/transparencia/${v}`)}>
            <SelectTrigger className="bg-card border-border text-foreground">
              <SelectValue placeholder="Escolha uma UF" />
            </SelectTrigger>
            <SelectContent>
              {UFS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!uf && (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-slate-600">Selecione um estado acima para ver os editais vigentes</p>
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
            <h2 className="text-sm font-mono uppercase tracking-wider text-slate-500 mb-4">
              {dados.uf_nome} ({dados.uf})
            </h2>
            {dados.editais.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-12 text-center">
                  <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-slate-600">Nenhum edital vigente neste estado no momento</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {dados.editais.map(e => (
                  <Card key={e.edital_id} className="bg-card border-border">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{e.titulo}</h3>
                          {e.descricao && <p className="text-sm text-slate-600 mt-1">{e.descricao}</p>}
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Aberto</Badge>
                      </div>

                      {e.data_encerramento && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                          <Calendar className="h-3.5 w-3.5" />
                          Encerra em {new Date(e.data_encerramento).toLocaleDateString('pt-BR')}
                        </div>
                      )}

                      {e.documentos_obrigatorios?.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-2">Documentos exigidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {e.documentos_obrigatorios.map((d, i) => (
                              <Badge key={i} className="bg-muted text-slate-700 border-input text-xs">{d}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        {e.termo_adesao_preview_url && (
                          <Button size="sm" variant="outline" onClick={() => setPreview({ nome: 'Termo de adesão', url: `${BACKEND_URL}${e.termo_adesao_preview_url}` })}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> Prévia do termo
                          </Button>
                        )}
                        {e.anexos.map((a, i) => (
                          <Button key={i} size="sm" variant="outline" onClick={() => setPreview({ nome: a.nome, url: `${BACKEND_URL}${a.preview_url}` })}>
                            <Paperclip className="h-3.5 w-3.5 mr-2" /> Prévia: {a.nome}
                          </Button>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
                          <div><p className="text-sm font-semibold text-slate-900">Documento integral protegido</p><p className="mt-0.5 text-xs leading-5 text-slate-600">Faça login em uma conta habilitada ou adquira um plano para acessar o edital completo.</p></div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate('/cadastro')}><UserPlus className="mr-2 h-3.5 w-3.5" /> Criar conta</Button>
                          <Button size="sm" onClick={() => navigate('/login')}><LogIn className="mr-2 h-3.5 w-3.5" /> Entrar</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-10">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-slate-500 hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao início
          </Button>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{preview?.nome}</DialogTitle>
            <DialogDescription>Prévia pública protegida — somente a primeira página é exibida.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] overflow-auto bg-slate-100 p-4 sm:p-6">
            {preview && <img src={preview.url} alt={`Primeira página de ${preview.nome}`} draggable="false" className="mx-auto w-full max-w-3xl select-none border border-slate-200 bg-white shadow-lg" />}
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">A versão integral não é transmitida nesta consulta pública.</p>
            <div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/cadastro')}>Criar conta</Button><Button onClick={() => navigate('/planos')}>Conhecer acessos</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
