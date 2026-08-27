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

export const BLOCO_PORTARIA_NOMES = {
  1: 'Bloco I — Habilitação Jurídica, Fiscal e Trabalhista',
  2: 'Bloco II — Qualificação Econômico-Financeira',
  3: 'Bloco III — Qualificação Técnica',
};
export const BLOCO_PORTARIA_ROMANO = { 1: 'I', 2: 'II', 3: 'III' };

// Seletor de itens do catálogo de checklist (GET/POST /checklist-catalogo),
// agrupado por bloco, com "+ Criar item novo" embutido. Extraído de
// Portarias.js — o form "Nova Portaria" de onde veio foi removido de lá;
// hoje quem cria portaria/checklist é o wizard Criar Evento (passo Documentos).
// `selecionados` é o Set<catalogo_item_id> vindo do form do chamador;
// `onToggle(item)` recebe o item completo do catálogo — quem decide como
// adicionar/remover do payload final é o chamador.
const ChecklistCatalogoPicker = ({ selecionados, onToggle }) => {
  const [catalogo, setCatalogo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoItemAberto, setNovoItemAberto] = useState(false);
  const [novoItemBloco, setNovoItemBloco] = useState(1);
  const [novoItemPerfil, setNovoItemPerfil] = useState('registradora');
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemDescricao, setNovoItemDescricao] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await axios.get(`${API}/checklist-catalogo`, { withCredentials: true });
        setCatalogo(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Erro ao carregar catálogo de checklist:', error);
        toast.error('Erro ao carregar catálogo de checklist');
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

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
      <div className="space-y-4">
        {Object.entries(BLOCO_PORTARIA_NOMES).map(([blocoNum, blocoNome]) => {
          const itensDoBloco = catalogo.filter((it) => it.bloco === Number(blocoNum));
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
                    <Badge className={item.perfil_alvo === 'registradora'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs shrink-0'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs shrink-0'}>
                      {item.perfil_alvo === 'registradora' ? 'Registradora' : 'Financeira'}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {catalogo.length === 0 && (
          <p className="text-xs text-zinc-500">Catálogo ainda vazio — crie o primeiro item abaixo.</p>
        )}
      </div>

      <div className="mt-3">
        {novoItemAberto ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
            <Input
              value={novoItemNome}
              onChange={(e) => setNovoItemNome(e.target.value)}
              placeholder="Nome do item novo"
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={String(novoItemBloco)} onValueChange={(v) => setNovoItemBloco(Number(v))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {Object.keys(BLOCO_PORTARIA_NOMES).map((num) => (
                    <SelectItem key={num} value={num}>{`Bloco ${BLOCO_PORTARIA_ROMANO[num]}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={novoItemPerfil} onValueChange={setNovoItemPerfil}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="registradora">Registradora</SelectItem>
                  <SelectItem value="financeira">Financeira</SelectItem>
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
                className="border-zinc-700 text-zinc-300"
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
