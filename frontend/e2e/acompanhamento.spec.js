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
