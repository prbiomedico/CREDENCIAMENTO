#!/bin/bash
# Script padrão de rebuild/restart do sigcr-backend — SEMPRE usar este
# script em vez de `docker build`/`docker run` manuais.
#
# Por quê: em 2026-08-01 um rebuild manual esqueceu o bind mount de
# backend/uploads/, e todo documento enviado depois disso (pelo menos até
# 2026-08-02) ficou só na camada gravável do container — perdido no rebuild
# seguinte. 4 dos 7 documentos da HD Registros perderam o arquivo físico de
# vez por causa disso (recuperados no banco, não no disco). Ver
# PENDING_ACTIONS.md, item "Incidente do bind mount de uploads".
#
# Este script garante o mount sempre, então esse tipo de regressão silenciosa
# não pode mais acontecer só porque alguém digitou o docker run de cabeça.
set -euo pipefail

cd "$(dirname "$0")"
BACKEND_DIR="$(pwd)"

# Trava adicionada em 2026-08-11: o mount de uploads abaixo é sempre
# "$BACKEND_DIR/uploads" — internamente consistente, mas isso significa que
# rodar este script de dentro de um worktree isolado (técnica usada pra
# manter código não testado fora de um deploy pontual) silenciosamente
# monta o uploads/ VAZIO do worktree, não o real. Foi exatamente assim que o
# incidente de 2026-08-11 aconteceu (ver PENDING_ACTIONS.md item 16): dois
# deploys de backend rodaram a partir de worktrees isolados e reapontaram o
# container pra um uploads/ órfão em /tmp, sem erro nenhum — a checagem de
# mount abaixo só confirma que ALGUM mount pegou, não que a FONTE é a certa.
# Se este script está sendo executado fora do checkout real, pare: copie o
# server.py isolado pra cá (sobrescrevendo temporariamente), rode a partir
# daqui, e restaure o arquivo original depois — nunca rode este script de
# dentro de um worktree.
CANONICAL_BACKEND_DIR="/opt/sigcr/backend"
if [ "$BACKEND_DIR" != "$CANONICAL_BACKEND_DIR" ]; then
  echo "ERRO: deploy.sh precisa rodar a partir de $CANONICAL_BACKEND_DIR (está em $BACKEND_DIR)." >&2
  echo "Rodar de um worktree isolado monta um uploads/ vazio — ver comentário acima. Copie o server.py pra cá antes de rodar." >&2
  exit 1
fi

# Trava adicionada em 2026-08-12: nunca builda/deploya sem antes garantir
# que o codigo esta commitado e no GitHub. Ver PENDING_ACTIONS.md e
# scripts/git-sync-or-die.sh -- foi descoberto nesse fix que producao tinha
# ficado 16 commits a frente do origin porque a credencial de push da VPS
# estava quebrada ha semanas, sem ninguem notar. Se isso falhar, o deploy
# para aqui (exit 1 propagado pelo `set -e`), antes de qualquer build.
bash "$BACKEND_DIR/../scripts/git-sync-or-die.sh" backend backend

TS=$(date +%Y%m%d-%H%M)
ROLLBACK_TAG="sigcr-backend:pre-deploy-rollback-${TS}"

if docker image inspect sigcr-backend:latest > /dev/null 2>&1; then
  docker tag sigcr-backend:latest "$ROLLBACK_TAG"
  echo "Rollback tag criada: $ROLLBACK_TAG"
fi

docker build -t sigcr-backend -f "$BACKEND_DIR/Dockerfile" "$BACKEND_DIR"

docker stop sigcr-backend 2>/dev/null || true
docker rm sigcr-backend 2>/dev/null || true

mkdir -p "$BACKEND_DIR/uploads"

docker run -d --name sigcr-backend --restart no \
  --network sigcr-net -p 8003:8000 \
  --env-file "$BACKEND_DIR/.env" \
  -v "$BACKEND_DIR/uploads:/app/uploads" \
  sigcr-backend

sleep 3

# Confirma que o mount pegou E que a fonte é a esperada — falha alto (exit
# != 0) se não pegou, em vez de deixar passar silenciosamente (ver
# incidente 2026-08-11 acima: um mount "presente" mas com fonte errada
# passava por esta checagem antes de ela verificar o Source também).
MOUNTS=$(docker inspect sigcr-backend --format '{{json .Mounts}}')
if ! echo "$MOUNTS" | grep -q "\"Destination\":\"/app/uploads\""; then
  echo "ERRO: bind mount de /app/uploads NÃO foi aplicado ao container. Mounts atuais: $MOUNTS" >&2
  exit 1
fi
if ! echo "$MOUNTS" | grep -q "\"Source\":\"$BACKEND_DIR/uploads\""; then
  echo "ERRO: bind mount de /app/uploads aponta pra uma fonte inesperada. Mounts atuais: $MOUNTS" >&2
  exit 1
fi

echo "Deploy concluído. Bind mount de uploads confirmado ativo."
echo "Rollback disponível via: docker stop sigcr-backend && docker rm sigcr-backend && docker run -d --name sigcr-backend --restart no --network sigcr-net -p 8003:8000 --env-file $BACKEND_DIR/.env -v $BACKEND_DIR/uploads:/app/uploads $ROLLBACK_TAG"
