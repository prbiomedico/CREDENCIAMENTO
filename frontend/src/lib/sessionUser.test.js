import { reconcileSessionUser } from './sessionUser';
const user = { user_id: 'hd', email: 'hd@example.com', name: 'HD', picture: null, perfil: 'sigcr_admin', detran_uf: null, roles: ['sigcr_admin', 'registradora'] };
test('renovação com os mesmos dados preserva a referência usada pelas telas', () => {
  expect(reconcileSessionUser(user, { ...user, roles: ['registradora', 'sigcr_admin'] })).toBe(user);
});
test.each([
  { user_id: 'outro' }, { perfil: 'detran' }, { detran_uf: 'SP' },
  { roles: ['registradora'] }, { name: 'Outro nome' }, { email: 'novo@example.com' },
])('mudança real de identidade ou permissão atualiza o usuário: %j', change => {
  const next = { ...user, ...change };
  expect(reconcileSessionUser(user, next)).toBe(next);
});
test('login e logout continuam atualizando a sessão', () => {
  expect(reconcileSessionUser(null, user)).toBe(user);
  expect(reconcileSessionUser(user, null)).toBeNull();
});
