// Inclua uma UF somente após verificar seu endereço oficial de consulta.
// Não derivar URLs de siglas: nem todos os DETRANs usam a mesma instalação.
export const SEI_PORTAIS = Object.freeze({
  RN: Object.freeze({
    nome: 'SEI-RN',
    consultaUrl: 'https://sei.rn.gov.br/sei/modulos/pesquisa/md_pesq_processo_pesquisar.php?acao_externa=protocolo_pesquisar&acao_origem_externa=protocolo_pesquisar&id_orgao_acesso_externo=0',
  }),
});

export const getSeiPortal = (uf) => SEI_PORTAIS[String(uf || '').toUpperCase()] || null;
