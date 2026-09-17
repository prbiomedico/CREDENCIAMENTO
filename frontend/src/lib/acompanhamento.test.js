import { montarProcessos, pendenciasSubmissao } from './acompanhamento';
const empresa = { company_id: 'hd', user_id: 'dono', cnpj: '12.345.678/0001-00' };
test('etapas futuras e diligência interna não são pendências da empresa', () => {
  const [p] = montarProcessos(empresa, [{ company_id: 'hd', esteira_id: 'rn', detran: 'RN', eventos: [{ etapa_id: 1, status: 'concluido' }, { etapa_id: 2, status: 'em_andamento', obs: 'Diligência interna' }, { etapa_id: 3, status: 'pendente' }] }], []);
  expect(p.etapa).toBe('Análise documental'); expect(p.pendencias).toEqual([]);
});
test('reenvio de diligência corresponde somente ao item inconforme', () => {
  expect(pendenciasSubmissao({ status: 'em_diligencia', itens: [{ item_id: 'a', nome: 'Declaração conjunta', status: 'inconforme', justificativa: 'Assinar' }, { item_id: 'b', status: 'enviado' }, { item_id: 'c', status: 'pendente' }] })).toEqual([{ id: 'item-a', titulo: 'Declaração conjunta', descricao: 'Assinar', prazo: null }]);
});
test('declaração conjunta não é dividida por nome ou conteúdo', () => {
  const pendencias = pendenciasSubmissao({ status: 'rascunho', itens: [{ item_id: 'abc', nome: 'Declaração A/B/C e CISSP ITIL COBIT', status: 'pendente' }] });
  expect(pendencias).toHaveLength(1);
});
test('comprovante enviado e contrato entregue não geram nova cobrança', () => {
  expect(pendenciasSubmissao({ status: 'taxa_credenciamento', taxa_credenciamento: { status: 'enviado' } })).toEqual([]);
  expect(pendenciasSubmissao({ status: 'contrato_assinatura', contrato: { assinado_path: '/arquivo.pdf' } })).toEqual([]);
});
test('taxa rejeitada e contrato por assinar viram ações explícitas', () => {
  expect(pendenciasSubmissao({ status: 'taxa_credenciamento', taxa_credenciamento: { status: 'rejeitado', vencimento: '2026-10-01' } })[0].prazo).toBe('2026-10-01');
  expect(pendenciasSubmissao({ status: 'contrato_assinatura' })[0].id).toBe('contrato');
});
test('isola empresa, incluindo esteiras legadas por dono e CNPJ', () => {
  const rows = montarProcessos(empresa, [{ company_id: 'outra' }, { user_id: 'dono', cnpj: '12345678000100', esteira_id: 'legada' }, { user_id: 'outro', cnpj: empresa.cnpj }, { user_id: 'dono', cnpj: '000' }], [{ company_id: 'outra' }]);
  expect(rows).toHaveLength(1); expect(rows[0].id).toBe('esteira-legada');
});
test('não une fontes só por compartilharem UF', () => {
  expect(montarProcessos(empresa, [{ company_id: 'hd', esteira_id: 'e', detran: 'RN' }], [{ company_id: 'hd', submissao_id: 's', estado_sigla: 'RN', status: 'em_analise' }])).toHaveLength(2);
});

test('identificador interno não é apresentado como protocolo e mantém o vínculo da ação', () => {
  const [p] = montarProcessos(empresa, [], [{ company_id: 'hd', submissao_id: 'subm_4257b4d41bb0', estado_sigla: 'RN', status: 'em_analise' }]);
  expect(p.numero).toBe('Solicitação sem protocolo');
  expect(p.href).toBe('/credenciamento-portaria?submissao_id=subm_4257b4d41bb0');
});

test('ato externo comprovado conclui o acompanhamento sem inventar etapas intermediárias', () => {
  const [p] = montarProcessos(empresa, [{ company_id: 'hd', esteira_id: 'ap', detran: 'AP', numero_processo: '0053.0649.2804.0200/2025', credenciamento_externo: { documento_id: 'portaria-ap', validade: '2027-04-15' }, eventos: [{ etapa_id: 2, status: 'aguardando' }, { etapa_id: 5, status: 'concluido' }] }], []);
  expect(p.concluido).toBe(true); expect(p.etapa).toBe('Credenciamento registrado — Apto');
  expect(p.numero).toBe('0053.0649.2804.0200/2025'); expect(p.usaSei).toBe(false);
  expect(p.validade).toBe('2027-04-15'); expect(p.eventos[0].status).toBe('aguardando');
});
