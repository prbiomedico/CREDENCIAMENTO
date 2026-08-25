import React, { useState } from 'react';
import { Search, Calendar, ExternalLink, Sparkles, Globe, Filter, ChevronDown, X, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Mapa de estados brasileiros com códigos IBGE (usados como territory_id no Querido Diário)
export const ESTADOS_IBGE = [
  { sigla: 'AC', nome: 'Acre', codigo: '12' },
  { sigla: 'AL', nome: 'Alagoas', codigo: '27' },
  { sigla: 'AP', nome: 'Amapá', codigo: '16' },
  { sigla: 'AM', nome: 'Amazonas', codigo: '13' },
  { sigla: 'BA', nome: 'Bahia', codigo: '29' },
  { sigla: 'CE', nome: 'Ceará', codigo: '23' },
  { sigla: 'DF', nome: 'Distrito Federal', codigo: '53' },
  { sigla: 'ES', nome: 'Espírito Santo', codigo: '32' },
  { sigla: 'GO', nome: 'Goiás', codigo: '52' },
  { sigla: 'MA', nome: 'Maranhão', codigo: '21' },
  { sigla: 'MT', nome: 'Mato Grosso', codigo: '51' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', codigo: '50' },
  { sigla: 'MG', nome: 'Minas Gerais', codigo: '31' },
  { sigla: 'PA', nome: 'Pará', codigo: '15' },
  { sigla: 'PB', nome: 'Paraíba', codigo: '25' },
  { sigla: 'PR', nome: 'Paraná', codigo: '41' },
  { sigla: 'PE', nome: 'Pernambuco', codigo: '26' },
  { sigla: 'PI', nome: 'Piauí', codigo: '22' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', codigo: '33' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', codigo: '24' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', codigo: '43' },
  { sigla: 'RO', nome: 'Rondônia', codigo: '11' },
  { sigla: 'RR', nome: 'Roraima', codigo: '14' },
  { sigla: 'SC', nome: 'Santa Catarina', codigo: '42' },
  { sigla: 'SP', nome: 'São Paulo', codigo: '35' },
  { sigla: 'SE', nome: 'Sergipe', codigo: '28' },
  { sigla: 'TO', nome: 'Tocantins', codigo: '17' },
];

export const TERMOS_SUGERIDOS = [
  'portaria credenciamento registradora',
  'CONTRAN 807',
  'registro de contratos veículos',
  'credenciamento DETRAN',
  'Portaria 1452',
  'alienação fiduciária',
];

/**
 * Busca de referência no Querido Diário (Diários Oficiais brasileiros).
 * Extraído de Portarias.js para ser reaproveitado também na aba "Portarias"
 * da página Estado > UF, sem duplicar a lógica de busca.
 *
 * - estadoFixo: sigla (ex. "SP") — quando presente, trava o estado da busca
 *   (usado dentro da página de um estado específico) em vez de deixar o
 *   usuário escolher livremente.
 * - onPromover(item, estadoSigla): quando fornecido, exibe um botão
 *   "Promover" em cada resultado — abre o cadastro de portaria pré-preenchido
 *   com os dados do resultado. A promoção NUNCA salva sozinha: é só um atalho
 *   de preenchimento, o usuário ainda revisa e confirma o cadastro.
 */
export default function QueridoDiarioBusca({ estadoFixo, onPromover }) {
  const { keycloak } = useAuth();

  const estadoInicial = estadoFixo
    ? ESTADOS_IBGE.find((e) => e.sigla === estadoFixo) || ESTADOS_IBGE[5]
    : ESTADOS_IBGE[5]; // Ceará padrão

  const [qdEstado, setQdEstado] = useState(estadoInicial);
  const [qdQuery, setQdQuery] = useState('portaria credenciamento registradora');
  const [qdDataInicio, setQdDataInicio] = useState('');
  const [qdDataFim, setQdDataFim] = useState('');
  const [qdResults, setQdResults] = useState(null);
  const [qdLoading, setQdLoading] = useState(false);
  const [qdError, setQdError] = useState('');
  const [qdFiltrosAbertos, setQdFiltrosAbertos] = useState(false);
  const [qdEstadoDropdown, setQdEstadoDropdown] = useState(false);

  const getToken = async () => {
    if (keycloak && keycloak.token) {
      if (keycloak.isTokenExpired(30)) {
        await keycloak.updateToken(30);
      }
    }
  };

  const buscarQueridoDiario = async () => {
    if (!qdQuery.trim()) return;
    setQdLoading(true);
    setQdError('');
    try {
      await getToken();
      const params = new URLSearchParams({
        territory_id: qdEstado.codigo,
        querystring: qdQuery,
        size: 10,
      });
      if (qdDataInicio) params.append('published_since', qdDataInicio);
      if (qdDataFim) params.append('published_until', qdDataFim);

      const response = await axios.get(
        `${API}/portarias/queridodiario?${params.toString()}`,
        { withCredentials: true }
      );
      setQdResults(response.data);
    } catch (err) {
      setQdError('Erro ao consultar o Querido Diário. Tente novamente.');
    } finally {
      setQdLoading(false);
    }
  };

  const limparFiltrosQD = () => {
    setQdDataInicio('');
    setQdDataFim('');
    setQdResults(null);
    setQdError('');
  };

  return (
    <div>
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary-500/10 rounded-lg border border-primary-500/20">
          <Globe className="h-5 w-5 text-primary-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Querido Diário
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs font-normal">API Pública</Badge>
          </h2>
          <p className="text-sm text-zinc-400">Busca em Diários Oficiais brasileiros — Open Knowledge Brasil</p>
        </div>
      </div>

      {/* Painel de busca principal */}
      <Card className="bg-zinc-900/60 border-zinc-800 mb-4">
        <CardContent className="p-5 space-y-4">

          {/* Linha 1: Estado + Palavra-chave + Buscar */}
          <div className="flex flex-col sm:flex-row gap-3">

            {/* Seletor de Estado (travado quando estadoFixo é passado) */}
            <div className="sm:w-56">
              <Label className="text-zinc-400 text-xs mb-1.5 block">Estado</Label>
              {estadoFixo ? (
                <div className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-md text-sm">
                  <span className="text-primary-400 font-mono font-bold text-xs">{qdEstado.sigla}</span>
                  <span className="text-zinc-300">{qdEstado.nome}</span>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setQdEstadoDropdown(!qdEstadoDropdown)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm hover:border-zinc-600 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-primary-400 font-mono font-bold text-xs">{qdEstado.sigla}</span>
                      <span className="text-zinc-300">{qdEstado.nome}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                  </button>
                  {qdEstadoDropdown && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-xl max-h-60 overflow-y-auto">
                      {ESTADOS_IBGE.map((estado) => (
                        <button
                          key={estado.sigla}
                          type="button"
                          onClick={() => { setQdEstado(estado); setQdEstadoDropdown(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-zinc-700 transition-colors ${qdEstado.sigla === estado.sigla ? 'bg-zinc-700' : ''}`}
                        >
                          <span className="text-primary-400 font-mono font-bold text-xs w-6">{estado.sigla}</span>
                          <span className="text-zinc-300">{estado.nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Campo de busca */}
            <div className="flex-1">
              <Label className="text-zinc-400 text-xs mb-1.5 block">Palavra-chave</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    value={qdQuery}
                    onChange={(e) => setQdQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buscarQueridoDiario()}
                    placeholder="Ex: portaria credenciamento registradora"
                    className="pl-9 bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <Button
                  onClick={buscarQueridoDiario}
                  disabled={qdLoading}
                  className="bg-primary-500 hover:bg-primary-600 text-white gap-2 shrink-0"
                >
                  {qdLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Search className="h-4 w-4" />}
                  {qdLoading ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>
          </div>

          {/* Filtros avançados (colapsáveis) */}
          <div>
            <button
              type="button"
              onClick={() => setQdFiltrosAbertos(!qdFiltrosAbertos)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros avançados
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${qdFiltrosAbertos ? 'rotate-180' : ''}`} />
            </button>

            {qdFiltrosAbertos && (
              <div className="mt-3 flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Label className="text-zinc-400 text-xs mb-1.5 block">Publicado desde</Label>
                  <Input
                    type="date"
                    value={qdDataInicio}
                    onChange={(e) => setQdDataInicio(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-zinc-400 text-xs mb-1.5 block">Publicado até</Label>
                  <Input
                    type="date"
                    value={qdDataFim}
                    onChange={(e) => setQdDataFim(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                  />
                </div>
                {(qdDataInicio || qdDataFim) && (
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      onClick={limparFiltrosQD}
                      className="text-zinc-500 hover:text-zinc-300 gap-1 text-xs"
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sugestões de termos */}
          {!qdResults && !qdLoading && (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-zinc-600 self-center">Sugestões:</span>
              {TERMOS_SUGERIDOS.map((termo) => (
                <button
                  key={termo}
                  type="button"
                  onClick={() => { setQdQuery(termo); }}
                  className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-primary-500/40 hover:text-primary-400 transition-colors"
                >
                  {termo}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Erro */}
      {qdError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {qdError}
        </div>
      )}

      {/* Resultados */}
      {qdResults && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              <span className="text-primary-400 font-semibold">{qdResults.total || 0}</span> resultado(s) em{' '}
              <span className="text-zinc-300 font-medium">{qdEstado.nome}</span>{' '}
              para <span className="text-zinc-300">"{qdQuery}"</span>
            </p>
            <button
              type="button"
              onClick={() => setQdResults(null)}
              className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
          </div>

          {qdResults.resultados && qdResults.resultados.length === 0 && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-10 w-10 text-zinc-700 mb-3" />
                <p className="text-zinc-400 font-medium mb-1">Nenhum resultado encontrado</p>
                <p className="text-zinc-600 text-sm">
                  O Querido Diário pode não cobrir esse estado/município.<br />
                  Tente termos diferentes ou outro estado.
                </p>
              </CardContent>
            </Card>
          )}

          {Array.isArray(qdResults.resultados) && qdResults.resultados.map((item, idx) => (
            <Card
              key={idx}
              className="bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <Badge className="bg-primary-500/10 text-primary-400 border-primary-500/20 font-mono text-xs">
                        <Calendar className="h-3 w-3 mr-1 inline" />
                        {new Date(item.date).toLocaleDateString('pt-BR')}
                      </Badge>
                      {item.edition && (
                        <Badge className="bg-zinc-700/50 text-zinc-300 border-zinc-600 font-mono text-xs">
                          Edição {item.edition}
                        </Badge>
                      )}
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs">
                        {qdEstado.sigla}
                      </Badge>
                    </div>
                    {Array.isArray(item.excerpts) && item.excerpts.map((exc, i) => (
                      <p
                        key={i}
                        className="text-sm text-zinc-300 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: exc.replace(
                            /<em>/g,
                            '<em class="text-primary-400 not-italic font-semibold bg-primary-500/10 px-0.5 rounded">'
                          )
                        }}
                      />
                    ))}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 border border-primary-500/20 hover:border-primary-500/40 rounded-md px-2.5 py-1.5 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver PDF
                      </a>
                    )}
                    {onPromover && (
                      <button
                        type="button"
                        onClick={() => onPromover(item, qdEstado.sigla)}
                        className="flex items-center gap-1.5 text-xs text-secondary-400 hover:text-secondary-300 border border-secondary-500/20 hover:border-secondary-500/40 rounded-md px-2.5 py-1.5 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        Promover
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
