#!/bin/bash
# Script padrao de build/deploy do frontend SIGCR -- SEMPRE usar este
# script em vez de rodar `npm run build` a mao ou copiar `build/` na mao.
#
# Codifica o padrao ja estabelecido (ver PENDING_ACTIONS.md e memoria do
# projeto): build feito num `git worktree` isolado (nunca em cima do
# working tree real), release nova em `releases/<label>/`, troca atomica
# do symlink `current` (sem downtime, sem janela com build/ parcial).
#
# Trava adicionada em 2026-08-12, junto com o backend: nunca builda a
# partir de um HEAD que nao esta no GitHub. O worktree parte de HEAD, entao
# se HEAD nao estiver commitado E empurrado, o worktree pode divergir
# silenciosamente do que realmente vai pro ar (foi assim que dois deploys
# de backend sobrescreveram trabalho em 2026-08-08/09 -- mesma classe de
# bug, aqui prevenida do lado do frontend). Ver scripts/git-sync-or-die.sh.
set -euo pipefail

cd "$(dirname "$0")"
FRONTEND_DIR="$(pwd)"
CANONICAL_FRONTEND_DIR="/opt/sigcr/frontend"
if [ "$FRONTEND_DIR" != "$CANONICAL_FRONTEND_DIR" ]; then
  echo "ERRO: deploy-frontend.sh precisa rodar a partir de $CANONICAL_FRONTEND_DIR (esta em $FRONTEND_DIR)." >&2
  exit 1
fi

bash "$FRONTEND_DIR/../scripts/git-sync-or-die.sh" frontend frontend

TS=$(date +%Y%m%d-%H%M)
LABEL="${1:-$TS}"
WORKTREE_DIR="/tmp/sigcr-build-${TS}"
RELEASE_DIR="$FRONTEND_DIR/releases/${LABEL}"

if [ -e "$RELEASE_DIR" ]; then
  echo "ERRO: $RELEASE_DIR ja existe -- escolha outro label." >&2
  exit 1
fi

cleanup() {
  if [ -d "$WORKTREE_DIR" ]; then
    git -C "$FRONTEND_DIR/.." worktree remove "$WORKTREE_DIR" --force 2>/dev/null || rm -rf "$WORKTREE_DIR"
  fi
}
trap cleanup EXIT

echo "Criando worktree isolado em $WORKTREE_DIR (a partir de HEAD, ja sincronizado com o GitHub)..."
# HEAD (detached), nao "main" -- main ja esta checked out no working tree
# principal (/opt/sigcr), e o git recusa dar checkout da mesma branch em
# dois worktrees ao mesmo tempo. Como o passo acima ja garante que HEAD ==
# origin/main, usar HEAD aqui e equivalente e evita esse conflito.
git -C "$FRONTEND_DIR/.." worktree add --detach "$WORKTREE_DIR" HEAD

echo "Instalando dependencias e buildando..."
(cd "$WORKTREE_DIR/frontend" && npm ci --legacy-peer-deps && npm run build)

if [ ! -d "$WORKTREE_DIR/frontend/build" ]; then
  echo "ERRO: build nao gerou $WORKTREE_DIR/frontend/build -- abortando, current nao foi tocado." >&2
  exit 1
fi

mkdir -p "$FRONTEND_DIR/releases"
cp -r "$WORKTREE_DIR/frontend/build" "$RELEASE_DIR"
echo "Release nova pronta em $RELEASE_DIR."

ln -s "$RELEASE_DIR" "$FRONTEND_DIR/current.tmp"
mv -T "$FRONTEND_DIR/current.tmp" "$FRONTEND_DIR/current"
echo "Swap atomico concluido -- current agora aponta pra $RELEASE_DIR."

echo "Rollback disponivel: religar o symlink pra uma release anterior em releases/ (ln -s releases/<anterior> current.tmp && mv -T current.tmp current)."
