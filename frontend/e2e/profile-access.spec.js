const { test, expect } = require('@playwright/test');

const perfisSemAdministracaoGlobal = [
  { perfil: 'detran', uf: 'SP' },
  { perfil: 'registradora', uf: null },
  { perfil: 'financeira', uf: null },
];

for (const contexto of perfisSemAdministracaoGlobal) {
  test(`${contexto.perfil} não atravessa a fronteira da administração global`, async ({ page }) => {
    await page.addInitScript(user => {
      localStorage.setItem('sigcr_cookies', JSON.stringify({ aceito: true }));
      localStorage.setItem('sigcr_e2e_user', JSON.stringify(user));
    }, {
      user_id: `${contexto.perfil}-e2e`, email: `${contexto.perfil}@example.com`,
      name: `Perfil ${contexto.perfil}`, perfil: contexto.perfil,
      roles: [contexto.perfil], detran_uf: contexto.uf,
    });
    await page.route('http://api.test/api/**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '{}',
    }));

    await page.goto('/usuarios');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('main').getByRole('heading', { name: 'Gestão de Usuários' })).toHaveCount(0);
  });
}
