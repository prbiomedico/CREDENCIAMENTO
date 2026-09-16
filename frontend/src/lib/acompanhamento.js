export const ETAPAS_ESTEIRA = { 1: 'Solicitação', 2: 'Análise documental', 3: 'Vistoria técnica', 4: 'Parecer jurídico', 5: 'Homologação' };
export const STATUS_PROCESSO = {
  rascunho: 'Preparação de documentos', submetido: 'Submetido ao DETRAN', em_analise: 'Em análise no DETRAN',
  em_diligencia: 'Diligência documental', poc_agendada: 'POC agendada', poc_reprovada: 'POC reprovada',
  poc_aprovada: 'POC aprovada', taxa_credenciamento: 'Taxa de credenciamento', contrato_pendente: 'Preparação do contrato',
  contrato_assinatura: 'Assinatura do contrato', homologacao_pendente: 'Aguardando homologação', homologado: 'Homologado',
};
export const STATUS_ETAPA = { pendente: 'Não iniciada', aguardando: 'Aguardando', em_andamento: 'Em andamento', concluido: 'Concluída', reprovado: 'Reprovada' };

export function pendenciasSubmissao(s) {
  const rows = [];
  const add = (id, titulo, descricao, prazo = null) => rows.push({ id, titulo, descricao, prazo });
  if (s.status === 'rascunho' || s.status === 'em_diligencia') {
    for (const item of s.itens || []) {
      if (item.status === 'inconforme' || (s.status === 'rascunho' && item.status === 'pendente')) {
        add(`item-${item.item_id}`, item.nome, item.justificativa || 'Documento aguardando envio no checklist.');
      }
    }
    if (s.status === 'rascunho' && !rows.length) add('submeter', 'Concluir e submeter requerimento', 'Revise o checklist e encaminhe a submissão ao DETRAN.');
  }
  const tentativa = (s.tentativas_poc || []).at(-1);
  if (s.status === 'poc_agendada' && ['pendente', 'rejeitado'].includes(tentativa?.pagamento_status)) {
    add('taxa-poc', 'Enviar comprovante da taxa da POC', tentativa.pagamento_justificativa || 'Acesse o credenciamento para enviar o comprovante.');
  }
  if (s.status === 'taxa_credenciamento' && ['pendente', 'rejeitado'].includes(s.taxa_credenciamento?.status)) {
    add('taxa', 'Enviar comprovante da taxa de credenciamento', s.taxa_credenciamento.justificativa || 'Acesse o credenciamento para enviar o comprovante.', s.taxa_credenciamento.vencimento);
  }
  if (s.status === 'contrato_assinatura' && !s.contrato?.assinado_path) add('contrato', 'Enviar contrato assinado', 'Confira a minuta e envie a versão assinada no credenciamento.');
  return rows;
}

export function montarProcessos(empresa, esteiras, submissoes) {
  if (!empresa) return [];
  const cnpj = value => String(value || '').replace(/\D/g, '');
  const manuais = esteiras.filter(e => e.company_id ? e.company_id === empresa.company_id : e.user_id === empresa.user_id && cnpj(e.cnpj) && cnpj(e.cnpj) === cnpj(empresa.cnpj)).map(e => {
    const eventos = [...(e.eventos || [])].sort((a, b) => a.etapa_id - b.etapa_id);
    const atual = eventos.find(ev => ['em_andamento', 'reprovado'].includes(ev.status)) || eventos.find(ev => ev.status !== 'concluido');
    const concluido = eventos.length >= 5 && eventos.every(ev => ev.status === 'concluido');
    return { id: `esteira-${e.esteira_id}`, uf: e.detran, numero: e.sei_processo || 'Número SEI não informado', origem: 'Acompanhamento manual',
      etapa: concluido ? 'Homologação registrada' : ETAPAS_ESTEIRA[atual?.etapa_id] || 'Etapa não informada',
      responsavel: atual?.responsavel || 'Não informado', atualizado: e.updated_at || e.created_at, concluido, eventos,
      pendencias: [], manual: true, aguardandoOrgao: false };
  });
  const digitais = submissoes.filter(s => s.company_id === empresa.company_id && !s.deleted_at).map(s => {
    const pendencias = pendenciasSubmissao(s);
    return { id: `submissao-${s.submissao_id}`, uf: s.estado_sigla, numero: s.submissao_id, origem: 'Credenciamento por portaria',
      etapa: STATUS_PROCESSO[s.status] || 'Situação não reconhecida', responsavel: pendencias.length ? 'Empresa' : s.status === 'homologado' ? 'Concluído' : 'Consultar processo',
      atualizado: s.homologado_em || s.analisado_em || s.submetido_em || s.created_at, concluido: s.status === 'homologado', eventos: [], pendencias, manual: false,
      href: `/credenciamento-portaria?submissao_id=${encodeURIComponent(s.submissao_id)}`,
      aguardandoOrgao: !pendencias.length && ['submetido', 'em_analise', 'contrato_pendente', 'homologacao_pendente'].includes(s.status) };
  });
  // Sem vínculo explícito entre submissão e SEI, não fundir processos apenas por UF.
  return [...manuais, ...digitais].sort((a, b) => b.pendencias.length - a.pendencias.length || String(a.uf).localeCompare(String(b.uf)));
}
