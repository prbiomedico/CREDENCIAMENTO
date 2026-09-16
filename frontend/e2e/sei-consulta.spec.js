const { test, expect } = require('@playwright/test');
const rnUrl = 'https://sei.rn.gov.br/sei/modulos/pesquisa/md_pesq_processo_pesquisar.php?acao_externa=protocolo_pesquisar&acao_origem_externa=protocolo_pesquisar&id_orgao_acesso_externo=0';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_cookies', JSON.stringify({ aceito: true })));
  await page.route('http://api.test/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (/\/estados\/[A-Z]{2}$/.test(path)) data = { estado_nome: 'Estado de teste', total_empresas: 0, total_portarias_vigentes: 0 };
    if (path === '/api/companies') data = [{ company_id: 'empresa-teste', name: 'Empresa de Teste', nome_fantasia: 'Empresa de Teste', detrans_atuacao: ['RN'], created_at: '2026-01-01' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
});
test('RN oferece consulta oficial sem iframe ou envio implícito', async ({ page }) => {
  await page.goto('/estados/RN');
  await page.getByRole('tab', { name: 'Processo SEI' }).click();
  await expect(page.getByRole('heading', { name: 'Processo SEI · DETRAN-RN' })).toBeVisible();
  const link = page.getByRole('link', { name: /Abrir consulta no SEI-RN/ });
  await expect(link).toHaveAttribute('href', rnUrl);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copiar número' })).toBeDisabled();
  await expect(page.getByText(/o número não é salvo no cadastro/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
});
test('cópia do número e alternativa quando clipboard é bloqueado', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async text => { window.numeroCopiado = text; },
  } }));
  await page.goto('/estados/RN');
  await page.getByRole('tab', { name: 'Processo SEI' }).click();
  await page.getByLabel('Número do processo para consulta').fill(' 02910013.014739/2026-32 ');
  await page.getByRole('button', { name: 'Copiar número' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Número copiado.' })).toBeVisible();
  expect(await page.evaluate(() => window.numeroCopiado)).toBe('02910013.014739/2026-32');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.getByRole('button', { name: 'Copiar número' }).click();
  await expect(page.getByText(/Selecione e copie o número manualmente/)).toBeVisible();
  await expect(page.getByLabel('Número do processo para consulta')).toBeFocused();
});
test('UF não configurada não oferece portal do RN', async ({ page }) => {
  await page.goto('/estados/SP');
  await page.getByRole('tab', { name: 'Processo SEI' }).click();
  await expect(page.getByRole('heading', { name: 'Consulta oficial ainda não configurada para SP' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir consulta/ })).toHaveCount(0);
});
test('registradora consulta sem credenciamento e limpa número ao trocar UF', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_e2e_user', JSON.stringify({
    user_id: 'registradora-teste', email: 'teste@example.com', name: 'Registradora Teste', perfil: 'registradora', roles: ['registradora'],
  })));
  await page.goto('/registradoras-empresa');
  await page.getByRole('button', { name: 'Consultar processo SEI' }).click();
  await page.getByLabel('DETRAN para consulta').selectOption('RN');
  await page.getByLabel('Número do processo para consulta').fill('02910013.014739/2026-32');
  await page.getByLabel('DETRAN para consulta').selectOption('SP');
  await expect(page.getByRole('heading', { name: /Consulta oficial ainda não configurada para SP/ })).toBeVisible();
  await page.getByLabel('DETRAN para consulta').selectOption('RN');
  await expect(page.getByLabel('Número do processo para consulta')).toHaveValue('');
});
