const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://auth.sigcr.com.br/**', (route) => route.fulfill({ status: 404, body: '' }));
});

test('landing expõe os caminhos públicos principais', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SIGCR/i);
  await expect(page.getByRole('heading', { name: /credenciamento regulatório/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /acessar plataforma/i })).toBeVisible();
});

test('cadastro de financeira carrega registradoras e exige vínculo', async ({ page }) => {
  await page.route('http://api.test/api/public/registradoras', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ company_id: 'comp_1', nome_fantasia: 'Registradora Teste' }]),
  }));
  await page.goto('/cadastro');
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Financeira' }).click();
  await expect(page.getByText('Registradora Vinculada')).toBeVisible();
  await page.getByRole('combobox').nth(1).click();
  await expect(page.getByRole('option', { name: 'Registradora Teste' })).toBeVisible();
});

test('cadastro rejeita senhas divergentes antes de chamar a API', async ({ page }) => {
  let posts = 0;
  await page.route('http://api.test/api/public/cadastro', (route) => { posts += 1; return route.fulfill({ status: 201, body: '{}' }); });
  await page.goto('/cadastro');
  const values = ['Empresa Teste Ltda', 'Empresa Teste', '11.222.333/0001-81',
    '(11) 99999-9999', 'Rua Teste, 1', 'Pessoa Teste', 'teste@example.com',
    'Senha123!', 'Outra123!'];
  const inputs = page.locator('form input:not([type="checkbox"])');
  for (let index = 0; index < values.length; index += 1) await inputs.nth(index).fill(values[index]);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('As senhas não conferem')).toBeVisible();
  expect(posts).toBe(0);
});
