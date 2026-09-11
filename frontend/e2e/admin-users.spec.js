const { test, expect } = require('@playwright/test');

const usuarios = [{
  id: 'kc-user-1', username: 'maria.silva', email: 'maria@example.com',
  firstName: 'Maria', lastName: 'Silva', enabled: true, perfil: 'detran',
  roles: ['detran'], uf: 'SP', created_at: '2026-09-08T12:00:00Z',
}];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_cookies', JSON.stringify({ aceito: true })));
  await page.route('http://api.test/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.route('http://api.test/api/admin/usuarios', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(usuarios),
  }));
  await page.route('http://api.test/api/admin/cadastros-pendentes', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
});

test('admin edita identidade, perfil e UF com atualização operacional', async ({ page }) => {
  let payload;
  await page.route('http://api.test/api/admin/usuarios/kc-user-1', async route => {
    if (route.request().method() === 'PATCH') payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"Usuário atualizado"}' });
  });

  await page.goto('/usuarios');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Gestão de Usuários' })).toBeVisible();
  await expect(page.getByText('08/09/2026')).toBeVisible();
  await page.getByRole('button', { name: 'Editar maria.silva' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Mariana');
  await page.getByLabel('UF do DETRAN').selectOption('RJ');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect.poll(() => payload).toMatchObject({
    username: 'maria.silva', email: 'maria@example.com', firstName: 'Mariana',
    role: 'detran', uf: 'RJ',
  });
});

test('admin redefine senha temporária e encerra sessões', async ({ page }) => {
  let passwordPayload;
  let logoutCalled = false;
  await page.route('http://api.test/api/admin/usuarios/kc-user-1/redefinir-senha', async route => {
    passwordPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('http://api.test/api/admin/usuarios/kc-user-1/encerrar-sessoes', async route => {
    logoutCalled = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Redefinir senha de maria.silva' }).click();
  await page.getByLabel('Nova senha').fill('Temporaria#2026');
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect.poll(() => passwordPayload).toEqual({ password: 'Temporaria#2026', temporary: true });

  await page.getByRole('button', { name: 'Encerrar sessões de maria.silva' }).click();
  await expect.poll(() => logoutCalled).toBe(true);
});

test('filtros combinam perfil, status e busca sem nova chamada', async ({ page }) => {
  await page.goto('/usuarios');
  await expect(page.getByText('Maria Silva')).toBeVisible();
  await page.getByPlaceholder('Buscar nome, usuário ou e-mail...').fill('inexistente');
  await expect(page.getByText('Nenhum usuário encontrado')).toBeVisible();
  await page.getByPlaceholder('Buscar nome, usuário ou e-mail...').fill('maria');
  await page.getByRole('combobox').filter({ has: page.locator('option[value="todos"]') }).last().selectOption('inativos');
  await expect(page.getByText('Nenhum usuário encontrado')).toBeVisible();
});

test('conflito 409 preserva usuário ativo e informa o administrador', async ({ page }) => {
  await page.route('http://api.test/api/admin/usuarios/kc-user-1/status', route => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ detail: 'A operação deixaria o SIGCR sem um administrador ativo' }),
  }));
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByText('A operação deixaria o SIGCR sem um administrador ativo', { exact: true })).toBeVisible();
  await expect(page.getByText('Ativo', { exact: true })).toBeVisible();
});

test('aprovação de cadastro pendente chama somente a operação confirmada', async ({ page }) => {
  let aprovacoes = 0;
  await page.route('http://api.test/api/admin/cadastros-pendentes', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([{
      company_id: 'company-1', nome_fantasia: 'Empresa Pendente', name: 'Empresa Pendente Ltda',
      cnpj: '11.222.333/0001-81', tipo_empresa: 'registradora', tipo_empresa_label: 'Registradora',
      responsavel: { nome: 'Responsável Teste' }, responsavel_email_conta: 'responsavel@example.com',
      created_at: '2026-09-09T12:00:00Z', historico_rejeicoes: [],
    }]),
  }));
  await page.route('http://api.test/api/admin/cadastros/company-1/aprovar', async route => {
    aprovacoes += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/usuarios');
  await page.getByRole('tab', { name: /Cadastros Pendentes/ }).click();
  await expect(page.getByText('Empresa Pendente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect.poll(() => aprovacoes).toBe(1);
});

test('perfil sem privilégio administrativo não acessa gestão de usuários', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_e2e_user', JSON.stringify({
    user_id: 'financeira-1', email: 'financeira@example.com', name: 'Financeira',
    perfil: 'financeira', detran_uf: null, roles: ['financeira'],
  })));
  await page.goto('/usuarios');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('main').getByText('Gestão de Usuários')).toHaveCount(0);
});
