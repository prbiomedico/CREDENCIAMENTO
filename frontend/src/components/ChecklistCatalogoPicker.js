import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

// Espelha server.py (CHECKLIST_CONTRAN_807_BLOCOS/CHECKLIST_DETRAN_DF_003_2022_BLOCOS)
// — cada perfil_alvo tem sua própria numeração de bloco, não comparável entre
// si (bloco 1 de registradora != bloco 1 de financeira). Só existe taxonomia
// nomeada pros 2 perfis legados; uma categoria nova (Fatia 2, modelo
// Credencia-CE) usa rótulo genérico "Bloco N" — ver `blocosDoPerfil` abaixo.
export const BLOCOS_POR_PERFIL = {
  registradora: {
    1: 'Habilitação Jurídica e Regularidade Fiscal e Trabalhista',
    2: 'Qualificação Econômico-Financeira',
    3: 'Qualificação Técnica e de Pessoal',
    4: 'Infraestrutura, Segurança e Tecnologia',
    5: 'Segurança da Informação e LGPD',
    6: 'Declaratórias Gerais',
  },
  financeira: {
    1: 'Habilitação Jurídica',
    2: 'Regularidade Fiscal e Trabalhista',
    3: 'Qualificação Técnica',
    4: 'Declaratórias',
  },
};

// Metadados de exibição só pros 2 perfis legados (cor/fonte regulatória
// conhecidas). Categoria nova cai no fallback dentro do render — nome vem
// do próprio catálogo de tipos, sem cor/fonte fixas.
const PERFIL_SECAO = {
  registradora: { label: 'Registradora', fonte: 'Resolução CONTRAN 807', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  financeira: { label: 'Financeira', fonte: 'Edital DETRAN-DF nº 003/2022', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

// Seletor de itens do catálogo de checklist (GET/POST /checklist-catalogo),
// agrupado por categoria de credenciamento (GET /tipos-credenciamento, Fatia
// 2 — antes era uma lista fixa de 2 perfis) e depois por bloco dentro de
// cada categoria, com "+ Criar item novo" embutido. `selecionados` é o
// Set<catalogo_item_id> vindo do form do chamador (itens de qualquer
// categoria podem estar selecionados ao mesmo tempo — uma portaria pode
// exigir checklist de várias categorias); `onToggle(item)` recebe o item
// completo do catálogo — quem decide como adicionar/remover do payload
// final é o chamador.
const ChecklistCatalogoPicker = ({ selecionados, onToggle }) => {
  const [catalogo, setCatalogo] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoItemAberto, setNovoItemAberto] = useState(false);
  const [novoItemPerfil, setNovoItemPerfil] = useState('registradora');
  const [novoItemBloco, setNovoItemBloco] = useState(1);
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemDescricao, setNovoItemDescricao] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [catalogoRes, tiposRes] = await Promise.all([
          axios.get(`${API}/checklist-catalogo`, { withCredentials: true }),
          axios.get(`${API}/tipos-credenciamento`, { withCredentials: true }),
        ]);
        setCatalogo(Array.isArray(catalogoRes.data) ? catalogoRes.data : []);
        const tiposCarregados = Array.isArray(tiposRes.data) ? tiposRes.data : [];
        setTipos(tiposCarregados);
        if (tiposCarregados.length && !tiposCarregados.some((t) => t.tipo_id === novoItemPerfil)) {
          setNovoItemPerfil(tiposCarregados[0].tipo_id);
        }
      } catch (error) {
        console.error('Erro ao carregar catálogo de checklist:', error);
        toast.error('Erro ao carregar catálogo de checklist');
      } finally {
        setCarregando(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  // Blocos nomeados só existem pros 2 perfis legados — categoria nova sem
  // taxonomia definida deriva os números de bloco já usados no catálogo
  // (ou só o bloco 1, se ainda não tem nenhum item), com rótulo genérico.
  const blocosDoPerfil = (perfil) => {
    if (BLOCOS_POR_PERFIL[perfil]) return BLOCOS_POR_PERFIL[perfil];
    const numerosUsados = [...new Set(catalogo.filter((it) => it.perfil_alvo === perfil).map((it) => it.bloco))].sort((a, b) => a - b);
    const base = numerosUsados.length ? numerosUsados : [1];
    return Object.fromEntries(base.map((n) => [n, `Bloco ${n}`]));
  };

  // Bloco selecionado no form de "novo item" precisa ser válido pro perfil
  // atual — ao trocar de perfil, se o bloco atual não existir mais na nova
  // numeração, volta pro primeiro bloco disponível dessa categoria.
  const trocarNovoItemPerfil = (perfil) => {
    setNovoItemPerfil(perfil);
    const blocos = blocosDoPerfil(perfil);
    if (!blocos[novoItemBloco]) setNovoItemBloco(Number(Object.keys(blocos)[0]));
  };

  const criarItemCatalogo = async () => {
    if (!novoItemNome.trim()) { toast.error('Informe o nome do item'); return; }
    setCriando(true);
    try {
      const response = await axios.post(`${API}/checklist-catalogo`, {
        bloco: novoItemBloco, nome: novoItemNome.trim(), descricao: novoItemDescricao.trim() || null, perfil_alvo: novoItemPerfil,
      }, { withCredentials: true });
      setCatalogo((prev) => [...prev, response.data]);
      setNovoItemNome('');
      setNovoItemDescricao('');
      setNovoItemAberto(false);
      toast.success('Item adicionado ao catálogo');
    } catch (error) {
      console.error('Erro ao criar item de catálogo:', error);
      toast.error(error?.response?.data?.detail || 'Erro ao criar item de catálogo');
    } finally {
      setCriando(false);
    }
  };

  if (carregando) {
    return <p className="text-xs text-zinc-500">Carregando catálogo...</p>;
  }

  return (
    <div>
      <div className="space-y-6">
        {tipos.map((tipo) => {
          const secao = PERFIL_SECAO[tipo.tipo_id] || {
            label: tipo.nome, fonte: tipo.descricao || null, badge: 'bg-zinc-700/50 text-zinc-300 border-zinc-600',
          };
          const itensDoPerfil = catalogo.filter((it) => it.perfil_alvo === tipo.tipo_id);
          const blocosNomes = blocosDoPerfil(tipo.tipo_id);
          return (
            <div key={tipo.tipo_id}>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`${secao.badge} text-xs shrink-0`}>{secao.label}</Badge>
                {secao.fonte && <p className="text-[11px] text-zinc-500">{secao.fonte}</p>}
              </div>
              {itensDoPerfil.length === 0 ? (
                <p className="text-xs text-zinc-500 mb-2">Nenhum item cadastrado pra esta categoria ainda.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(blocosNomes).map(([blocoNum, blocoNome]) => {
                    const itensDoBloco = itensDoPerfil.filter((it) => it.bloco === Number(blocoNum));
                    if (itensDoBloco.length === 0) return null;
                    return (
                      <div key={blocoNum}>
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">{blocoNome}</p>
                        <div className="space-y-1.5">
                          {itensDoBloco.map((item) => (
                            <label
                              key={item.item_id}
                              className="flex items-start gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:border-zinc-700"
                            >
                              <input
                                type="checkbox"
                                checked={selecionados.has(item.item_id)}
                                onChange={() => onToggle(item)}
                                className="rounded border-zinc-600 mt-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-zinc-200">{item.nome}</p>
                                {item.descricao && <p className="text-xs text-zinc-500 mt-0.5">{item.descricao}</p>}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {novoItemAberto ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
            <Input
              value={novoItemNome}
              onChange={(e) => setNovoItemNome(e.target.value)}
              placeholder="Nome do item novo"
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={novoItemPerfil} onValueChange={trocarNovoItemPerfil}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {tipos.map((t) => <SelectItem key={t.tipo_id} value={t.tipo_id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(novoItemBloco)} onValueChange={(v) => setNovoItemBloco(Number(v))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {Object.entries(blocosDoPerfil(novoItemPerfil)).map(([num, nome]) => (
                    <SelectItem key={num} value={num}>{nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={novoItemDescricao}
              onChange={(e) => setNovoItemDescricao(e.target.value)}
              placeholder="Descrição (opcional)"
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <div className="flex gap-2">
              <Button type="button" onClick={criarItemCatalogo} disabled={criando} className="bg-zinc-700 hover:bg-zinc-600 text-white gap-1">
                <Plus className="h-4 w-4" />
                {criando ? 'Salvando...' : 'Salvar no catálogo'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setNovoItemAberto(false); setNovoItemNome(''); setNovoItemDescricao(''); }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setNovoItemAberto(true)} className="border-zinc-700 border-dashed text-zinc-400 hover:bg-zinc-800 gap-1 w-full">
            <Plus className="h-4 w-4" />
            Criar item novo no catálogo
          </Button>
        )}
      </div>
    </div>
  );
};

export default ChecklistCatalogoPicker;
