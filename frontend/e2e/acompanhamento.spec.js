const { test, expect } = require('@playwright/test');
const empresa = { company_id: 'hd', user_id: 'dono', nome_fantasia: 'HD Registros', tipo_empresa: 'registradora', cnpj: '12345678000100' };
const esteira = { company_id: 'hd', user_id: 'dono', esteira_id: 'rn', detran: 'RN', sei_processo: '02910013.014739/2026-32', updated_at: '2026-09-16T15:00:00Z', eventos: [
  { etapa_id: 1, status: 'concluido', data: '2026-08-05', obs: 'Protocolo inicial concluído.', docs: 'Declaração 01 — itens a/b/c no mesmo documento.' },
  { etapa_id: 2, status: 'em_andamento', responsavel: 'DETRAN - CRED/REGCONTRATO', obs: 'Diligência interna. Nenhuma notificação da empresa registrada.' },
  { etapa_id: 3, status: 'pendente' },
] };
const sub = { company_id: 'hd', submissao_id: 's1', estado_sigla: 'CE', status: 'em_diligencia', itens: [{ item_id: 'abc', nome: 'Declaração conjunta', status: 'inconforme', justificativa: 'Assinar o documento.' }] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sigcr_cookies', JSON.stringify({ aceito: true }));
    localStorage.setItem('sigcr_e2e_user', JSON.stringify({ user_id: 'dono', perfil: 'registradora', roles: ['registradora'], name: 'HD Registros', email: 'teste@example.com' }));
  });
  await page.route('http://api.test/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/companies' ? [empresa] : path === '/api/esteiras' ? [esteira] : path === '/api/submissoes' ? [sub] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
});
test('registradora encontra acompanhamento, pendência e histórico RN', async ({ page }, testInfo) => {
  await page.goto('/acompanhamento');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Acompanhamento', exact: true })).toBeVisible();
  await expect(page.getByText('DETRAN-CE · Declaração conjunta')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resolver pendência' })).toHaveAttribute('href', '/credenciamento-portaria?submissao_id=s1');
  await page.getByRole('button', { name: 'Ver andamento 02910013.014739/2026-32' }).click();
  await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
  await expect(page.getByText('Declaração 01 — itens a/b/c no mesmo documento.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByText('Diligência interna. Nenhuma notificação da empresa registrada.')).toBeVisible();
  await page.getByRole('tab', { name: 'Consulta SEI', exact: true }).click();
  await expect(page.getByRole('link', { name: /Abrir consulta no SEI-RN/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Filtrar processos').selectOption('pendencias');
  await expect(page.getByRole('button', { name: 'Ver andamento Solicitação sem protocolo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver andamento 02910013.014739/2026-32' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Filtrar processos').selectOption('todos');
  await page.screenshot({ path: testInfo.outputPath('acompanhamento.png'), fullPage: true });
});
test('falha de dados não aparece como ausência de pendências; atualizar recupera', async ({ page }) => {
  await page.route('http://api.test/api/submissoes*', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/acompanhamento');
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar todos');
  await expect(page.getByText('Nenhuma ação da empresa registrada no fluxo digital.')).toHaveCount(0);
  await page.unroute('http://api.test/api/submissoes*');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText('DETRAN-CE · Declaração conjunta')).toBeVisible();
});
test('admin deve selecionar empresa e requisita escopo; troca remove dados anteriores', async ({ page }) => {
  const scopes = [];
  await page.addInitScript(() => localStorage.setItem('sigcr_e2e_user', JSON.stringify({ user_id: 'admin', perfil: 'sigcr_admin', roles: ['sigcr_admin'] })));
  await page.route('http://api.test/api/companies*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([empresa, { ...empresa, company_id: 'outra', nome_fantasia: 'Outra empresa' }]) }));
  await page.route('http://api.test/api/esteiras*', route => { const scope = new URL(route.request().url()).searchParams.get('view_as_company_id'); scopes.push(scope); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scope === 'hd' ? [esteira] : []) }); });
  await page.goto('/acompanhamento');
  await expect(page.getByText('Selecione uma empresa para visualizar seus processos e pendências.')).toBeVisible();
  expect(scopes).toEqual([]);
  await page.getByLabel('Empresa acompanhada').selectOption('hd');
  await expect(page.getByText('02910013.014739/2026-32', { exact: true })).toBeVisible();
  await page.getByLabel('Empresa acompanhada').selectOption('outra');
  await expect(page.getByText('Ainda não há processos registrados para esta empresa.')).toBeVisible();
  expect(scopes).toEqual(['hd', 'outra']);
  await expect(page.getByText('02910013.014739/2026-32', { exact: true })).toHaveCount(0);
});
for (const perfil of ['detran', 'financeira']) {
  test(`${perfil} não acessa acompanhamento da registradora`, async ({ page }) => {
    await page.addInitScript(role => localStorage.setItem('sigcr_e2e_user', JSON.stringify({ user_id: 'outro', perfil: role, roles: [role], detran_uf: 'RN' })), perfil);
    await page.goto('/acompanhamento');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('main').getByRole('heading', { name: 'Acompanhamento', exact: true })).toHaveCount(0);
  });
}

test('AP mostra ato externo e vigência sem atribuir processo ao SEI', async ({ page }) => {
  await page.route('http://api.test/api/esteiras*', route => route.fulfill({ json: [{ company_id: 'hd', esteira_id: 'ap', detran: 'AP', numero_processo: '0053.0649.2804.0200/2025', credenciamento_externo: { documento_id: 'ato', validade: '2027-04-15' }, eventos: [{ etapa_id: 2, status: 'aguardando', obs: 'Etapa sem histórico individual.' }, { etapa_id: 5, status: 'concluido', docs: 'Portaria 0254/2025 e espelho Apto.' }] }] }));
  await page.goto('/acompanhamento');
  await expect(page.getByText('Credenciamento registrado — Apto')).toBeVisible();
  await expect(page.getByText('Vigência registrada até 15/04/2027.')).toBeVisible();
  await page.getByLabel('Filtrar processos').selectOption('concluidos');
  await page.getByRole('button', { name: 'Ver andamento 0053.0649.2804.0200/2025' }).click();
  await expect(page.getByRole('tab', { name: 'Consulta SEI' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
  await expect(page.getByText('Portaria 0254/2025 e espelho Apto.')).toBeVisible();
});

const detalheAP = {
  empresa, uf: 'AP', credenciamentos: [{ credenciamento_id: 'cred-ap', categoria: 'registradora', status: 'ativo', validade: '2027-04-15', extrato_contrato: 'Portaria 0254/2025', renovacao: { disponivel: false, abre_em: '2027-02-14', motivo: 'Renovação disponível a partir de 14/02/2027.' } }],
  submissoes: [{ ...sub, estado_sigla: 'AP', finalidade: 'renovacao', status: 'rascunho', renovacao: { disponivel: false, motivo: 'Renovação disponível a partir de 14/02/2027.' } }], esteiras: [], oficiais: [], documentos: [{ document_id: 'doc1', document_name: 'Declaração conjunta', file_name: 'declaracao.pdf', download_url: '/documents/download/doc1' }], portarias: [], comunicacoes: [], solicitacoes: [],
};
test('acompanhamento completo mantém acervo e bloqueia renovação fora da janela', async ({ page }, testInfo) => {
  await page.route('http://api.test/api/companies/hd/acompanhamento/AP*', route => route.fulfill({ json: detalheAP }));
  await page.goto('/acompanhamento/AP?empresa=hd');
  await expect(page.getByRole('heading', { name: /DETRAN-AP/ })).toBeVisible();
  await expect(page.getByText('Renovação disponível a partir de 14/02/2027.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solicitar renovação' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('acompanhamento-estado.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
  await expect(page.getByText('Declaração conjunta', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Pedidos e checklist' }).click();
  await expect(page.getByText('Renovação · Acervo para futura renovação')).toBeVisible();
  await page.getByRole('tab', { name: 'Comunicações' }).click();
  await expect(page.getByText(/Nenhuma comunicação vinculada/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('renovação disponível exige portaria e usa o credenciamento correto', async ({ page }) => {
  await page.route('http://api.test/api/companies/hd/acompanhamento/AP*', route => route.fulfill({ json: { ...detalheAP, credenciamentos: [{ ...detalheAP.credenciamentos[0], renovacao: { disponivel: true, motivo: 'Renovação disponível.' } }], portarias: [{ portaria_id: 'p-ap', title: 'Portaria AP', status: 'vigente', checklist_itens: [{ perfil_alvo: 'registradora' }] }] } }));
  let chamado = false;
  await page.route('http://api.test/api/credenciamentos/cred-ap/renovacao*', route => { chamado = new URL(route.request().url()).searchParams.get('portaria_id') === 'p-ap' && route.request().method() === 'POST'; return route.fulfill({ status: 409, json: { detail: 'Janela encerrada. Atualize o acompanhamento.' } }); });
  await page.goto('/acompanhamento/AP?empresa=hd');
  await expect(page.getByRole('button', { name: 'Solicitar renovação' })).toBeDisabled();
  await page.getByLabel('Portaria para renovação').selectOption('p-ap');
  await page.getByRole('button', { name: 'Solicitar renovação' }).click();
  await expect(page.getByRole('alert')).toContainText('Janela encerrada');
  expect(chamado).toBe(true);
});

test('acervo permanece em documentos e separa banco dos estados', async ({ page }) => {
  await page.route('http://api.test/api/documents/hd', route => route.fulfill({ json: [
    { document_id: 'sp1', document_type: 'anexo_credenciamento', document_name: 'SP — Requerimento assinado', file_name: 'pedido.pdf', status: 'pending' },
    { document_id: 'bb1', document_type: 'acervo_hd', document_name: 'Banco do Brasil — Declaração', file_name: 'bb.pdf', status: 'pending' },
  ] }));
  await page.route('http://api.test/api/checklist-contran*', route => route.fulfill({ json: { blocos: [], resumo: { total: 0 } } }));
  await page.goto('/documentos');
  const acervo = page.getByRole('region', { name: 'Acervo da empresa', exact: true });
  await expect(acervo.getByRole('heading', { name: 'Acervo da empresa · 2 documentos' })).toBeVisible();
  await acervo.getByRole('button', { name: 'Instituições financeiras (1)', exact: true }).click();
  await expect(acervo.getByText('Banco do Brasil — Declaração', { exact: true })).toBeVisible();
  await expect(acervo.getByText('SP — Requerimento assinado', { exact: true })).toHaveCount(0);
  await acervo.getByRole('button', { name: 'SP (1)', exact: true }).click();
  await expect(acervo.getByRole('link', { name: 'Abrir acompanhamento de SP' })).toHaveAttribute('href', '/acompanhamento/SP?empresa=hd');
  await expect(acervo.getByText('Banco do Brasil — Declaração', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/acompanhamento');
  await expect(page.getByRole('region', { name: 'Acervo da empresa', exact: true })).toHaveCount(0);
});

test('painel avisa entregas finalizadas antes de selecionar UF e exclui rascunhos', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_e2e_user', JSON.stringify({ user_id: 'admin', perfil: 'sigcr_admin', roles: ['sigcr_admin'] })));
  await page.route('http://api.test/api/estados', r => r.fulfill({ json: [{ sigla: 'SP', nome: 'São Paulo', configurado: true }] }));
  await page.route('http://api.test/api/submissoes*', r => r.fulfill({ json: [
    { ...sub, submissao_id: 'novo', estado_sigla: 'SP', status: 'submetido', itens: [{ status: 'enviado', document_id: 'd1' }] },
    { ...sub, submissao_id: 'rascunho', estado_sigla: 'SP', status: 'rascunho' },
    { ...sub, submissao_id: 'parcial', estado_sigla: 'SP', status: 'rascunho', evidencias_para_conferencia: true },
  ] }));
  await page.goto('/detran/conferencia');
  const inbox = page.getByRole('region', { name: 'Envios aguardando conferência' });
  await expect(inbox.getByText('DETRAN-SP · Novo envio para conferência')).toBeVisible();
  await expect(inbox.getByRole('button', { name: 'Conferir documentos' })).toHaveCount(2);
  await expect(inbox.getByText('DETRAN-SP · Evidências parciais organizadas — pedido incompleto')).toBeVisible();
});
