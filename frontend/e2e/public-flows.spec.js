const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_cookies', JSON.stringify({ aceito: true })));
  await page.route('https://auth.sigcr.com.br/**', (route) => route.fulfill({ status: 404, body: '' }));
});

async function mockCadastroPorPortaria(page) {
  await page.route('http://api.test/api/portarias/publico/token-sp', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      portaria_id: 'portaria_sp',
      title: 'Edital de Credenciamento 01/2026',
      estado_sigla: 'SP',
      perfis_habilitados: ['registradora', 'financeira'],
    }),
  }));
  await page.route('http://api.test/api/public/portarias/token-sp/validar-cnpj', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      valido: true,
      cnpj: '11222333000181',
      estado_sigla: 'SP',
      tipo_empresa: 'registradora',
      empresa_ja_cadastrada: false,
      validacao: 'digitos_verificadores',
      validacao_oficial_pendente: true,
    }),
  }));
}

test('landing expõe os caminhos públicos principais', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SIGCR/i);
  await expect(page.getByRole('heading', { name: /credenciamento regulatório/i })).toBeVisible();
  const acesso = page.getByRole('button', { name: /acessar plataforma/i });
  await expect(acesso).toBeVisible();
  await expect(acesso).toHaveCSS('background-color', 'rgb(31, 41, 55)');
  await expect(page.getByRole('img', { name: 'SIGCR' }).first()).toHaveAttribute('src', /sigcr-logo-horizontal\.png$/);
});

test('entrada institucional apresenta o novo acesso seguro', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entre no ambiente SIGCR' })).toBeVisible();
  const acesso = page.getByRole('button', { name: /Continuar para autenticação/ });
  await expect(acesso).toBeVisible();
  await expect(acesso).toHaveCSS('background-color', 'rgb(2, 6, 23)');
  await expect(page.getByText('Sessão protegida.')).toBeVisible();
});

test('rotas operacionais não renderizam o sistema sem login', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sigcr_e2e_anonymous', '1'));
  for (const rota of ['/mapa-nacional', '/documentos/upload']) {
    await page.goto(rota);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entre no ambiente SIGCR' })).toBeVisible();
  }
});

test('consulta pública consolida portarias e editais e limita documentos à primeira página', async ({ page }) => {
  await page.route('http://api.test/api/public/atos-credenciamento/SP', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ uf: 'SP', uf_nome: 'São Paulo', atos: [{
      ato_id: 'edital_1', origem_registro: 'edital', tipo_documento: 'Edital',
      titulo: 'Edital de credenciamento 01/2026',
      descricao: 'Credenciamento estadual', status: 'aberto',
      documentos_obrigatorios: ['Contrato social'],
      cadastro_url: '/cadastro?portaria=token-sp',
      documentos: [{ nome: 'Edital completo.pdf', categoria: 'anexo', preview_url: '/api/public/editais/edital_1/preview/anexo/0' }],
    }] }),
  }));
  await page.route('http://api.test/api/public/editais/edital_1/preview/anexo/0', (route) => route.fulfill({
    status: 200, contentType: 'image/jpeg', body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  }));

  await page.goto('/transparencia/SP');
  await expect(page.getByRole('heading', { name: 'Portarias e Editais de Credenciamento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edital de credenciamento 01/2026' })).toBeVisible();
  await expect(page.getByText('Edital', { exact: true })).toBeVisible();
  await expect(page.getByText('Documento integral protegido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar cadastro' })).toBeVisible();
  await expect(page.locator('a[download]')).toHaveCount(0);
  await page.getByRole('button', { name: /Prévia: Edital completo/i }).click();
  await expect(page.getByText('somente a primeira página é exibida')).toBeVisible();
  await expect(page.getByRole('img', { name: /Primeira página/ })).toHaveAttribute('src', /preview\/anexo\/0$/);
  await expect(page.getByRole('button', { name: 'Falar com especialista' })).toBeVisible();
});

test('cadastro de financeira carrega registradoras e exige vínculo', async ({ page }) => {
  await mockCadastroPorPortaria(page);
  await page.route('http://api.test/api/public/registradoras', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ company_id: 'comp_1', nome_fantasia: 'Registradora Teste' }]),
  }));
  await page.goto('/cadastro?portaria=token-sp');
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Financeira' }).click();
  await expect(page.getByText('Registradora Vinculada')).toBeVisible();
  await page.getByRole('combobox').nth(1).click();
  await expect(page.getByRole('option', { name: 'Registradora Teste' })).toBeVisible();
});

test('cadastro rejeita senhas divergentes antes de chamar a API', async ({ page }) => {
  await mockCadastroPorPortaria(page);
  let posts = 0;
  await page.route('http://api.test/api/public/cadastro', (route) => { posts += 1; return route.fulfill({ status: 201, body: '{}' }); });
  await page.goto('/cadastro?portaria=token-sp');
  const values = ['Empresa Teste Ltda', 'Empresa Teste', '11.222.333/0001-81',
    '(11) 99999-9999', 'Rua Teste, 1', 'Pessoa Teste', 'teste@example.com',
    'Senha123!', 'Outra123!'];
  const inputs = page.locator('form input:not([type="checkbox"])');
  for (let index = 0; index < values.length; index += 1) await inputs.nth(index).fill(values[index]);
  await inputs.nth(2).blur();
  await expect(page.getByText('CNPJ válido para esta Portaria.')).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('As senhas não conferem')).toBeVisible();
  expect(posts).toBe(0);
});

test('cadastro direto não permite escolher perfil ou estado livremente', async ({ page }) => {
  await page.goto('/cadastro');
  await expect(page.getByRole('heading', { name: 'Cadastro protegido por Portaria' })).toBeVisible();
  await expect(page.getByText('Nenhum estado pode ser escolhido livremente.')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
});

test('contato comercial não expõe preços e confirma o pedido de reunião', async ({ page }) => {
  let payload;
  await page.route('http://api.test/api/public/contato-comercial', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recebido: true }) });
  });
  await page.goto('/planos');
  await expect(page.getByText('Valores, estados contratados e condições operacionais')).toBeVisible();
  await page.getByLabel('Nome').fill('Maria Silva');
  await page.getByLabel('E-mail').fill('maria@empresa.com.br');
  await page.getByLabel('Telefone').fill('(11) 99999-9999');
  await page.getByRole('button', { name: 'Solicitar contato' }).click();
  await expect(page.getByText('Solicitação recebida.')).toBeVisible();
  expect(payload).toMatchObject({ nome: 'Maria Silva', email: 'maria@empresa.com.br', telefone: '(11) 99999-9999' });
  await expect(page.getByText(/R\$\s*[\d.]+/)).toHaveCount(0);
});
