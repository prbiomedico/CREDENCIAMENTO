import React, { useId, useRef, useState } from 'react';
import { Copy, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getSeiPortal } from '../config/seiPortais';

/** Consulta assistida. Não envia documentos nem interpreta movimentos como intimações.
 * O caller remonta por UF/empresa para não transportar números entre contextos.
 */
export default function ProcessoSeiTab({ estadoSigla }) {
  const uf = String(estadoSigla || '').toUpperCase();
  const portal = getSeiPortal(uf);
  const inputId = useId();
  const inputRef = useRef(null);
  const [numero, setNumero] = useState('');
  const [aviso, setAviso] = useState('');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(numero.trim());
      setAviso('Número copiado. Cole no campo Nº SEI da consulta oficial.');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setAviso('Selecione e copie o número manualmente para usar na consulta oficial.');
    }
  };

  return (
    <section className="space-y-5" aria-label={`Consulta SEI do DETRAN-${uf}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Processo SEI · DETRAN-{uf}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acesse os documentos e andamentos disponibilizados pelo órgão.</p>
        </div>
        <Badge variant="outline">{portal ? 'Consulta pública' : 'Não configurado'}</Badge>
      </div>

      {portal ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="space-y-2">
              <Label htmlFor={inputId}>Número do processo para consulta</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input ref={inputRef} id={inputId} value={numero} maxLength={50}
                  onChange={(event) => { setNumero(event.target.value); setAviso(''); }}
                  placeholder="Digite ou cole o número do processo" autoComplete="off"
                  aria-describedby={`${inputId}-ajuda`} className="font-mono sm:max-w-sm" />
                <Button type="button" variant="outline" onClick={copiar} disabled={!numero.trim()}>
                  <Copy aria-hidden="true" /> Copiar número
                </Button>
              </div>
              <p id={`${inputId}-ajuda`} className="text-xs text-muted-foreground">
                Campo de apoio à consulta; o número não é salvo no cadastro.
              </p>
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{aviso}</p>
            </div>
            <Button asChild>
              <a href={portal.consultaUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" /> Abrir consulta no {portal.nome}
                <span className="sr-only"> (nova aba)</span>
              </a>
            </Button>
            <p className="text-sm leading-6 text-muted-foreground">
              Na nova aba, cole o número em “Nº SEI”, preencha o código de confirmação e clique em “Pesquisar”.
              A consulta acontece no portal oficial, fora do SIGCR.
            </p>
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground sm:px-5">
            Movimentações internas não representam, por si só, uma pendência da empresa.
            Confira as notificações dirigidas à empresa no seu acesso de usuário externo.
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-5">
          <Search className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">Consulta oficial ainda não configurada para {uf}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            O piloto está disponível para o Rio Grande do Norte. O endereço de consulta deste DETRAN precisa ser verificado antes da ativação.
          </p>
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Esta área oferece consulta assistida. Envio de documentos, recebimento de notificações e atualização automática pelo SEI ainda não estão integrados.
      </p>
    </section>
  );
}
