# Segurança de dependências

O frontend separa bibliotecas executadas no navegador de ferramentas usadas
somente no build. O gate de produção é `npm audit --omit=dev --audit-level=high`.
Alertas do toolchain legado CRA continuam visíveis no audit completo e devem ser
removidos pela migração planejada para Vite, não por `npm audit fix --force`.

Procedimento de atualização:

1. Atualizar um grupo funcional por vez.
2. Rodar build, testes de componentes e E2E desktop/mobile.
3. Conferir o diff do `package-lock.json` e o audit de runtime.
4. Evitar upgrades major automáticos em React Router, Zod e componentes Radix.

O override de `fflate` corrige a negação de serviço em ZIP64 malformado sem
alterar a API pública consumida pela aplicação.
