# Rollback operacional

Antes de cada publicação, registre o commit, a imagem do backend, o destino do
symlink do frontend e exporte configurações externas alteradas (como o perfil
de usuários do Keycloak). Nunca use `git reset --hard` como rollback de produção.

## Backend

O `backend/deploy.sh` cria uma imagem `sigcr-backend:pre-deploy-rollback-*`.
Pare e remova somente `sigcr-backend`, depois recrie o container com a imagem
registrada, a rede `sigcr-net`, o arquivo `backend/.env` e o bind mount de
`backend/uploads` usados pelo script oficial.

## Frontend

As releases ficam em `frontend/releases/`. Faça o symlink `frontend/current.tmp`
apontar para a release anterior e troque-o atomicamente por `frontend/current`.

## Keycloak

Restaure o JSON exportado antes da mudança por `PUT
/admin/realms/sigcr/users/profile`. Valide OIDC discovery e login antes de
encerrar a janela de manutenção.

## Verificação

Execute `ops/health-check.sh`, confira logs do backend e confirme que uploads,
login, API e ClamAV continuam operacionais.
