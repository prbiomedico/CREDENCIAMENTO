#!/bin/bash
# git-sync-or-die.sh <backend|frontend|caminho> [label]
#
# Garante que o codigo que esta prestes a ser deployado ja esta no GitHub
# ANTES de prosseguir com o build/deploy. Criado em 2026-08-12 depois de um
# incidente onde producao ficou 16 commits a frente do origin sem ninguem
# perceber, ate o dia em que um deploy feito a partir de um worktree/HEAD
# desatualizado sobrescreveu trabalho real (ver PENDING_ACTIONS.md). Causa
# raiz descoberta ao investigar este fix: nem o token HTTPS embutido no
# remote `origin` nem a chave SSH geral ja configurada nesta VPS ainda
# tinham permissao de push neste repo -- os pushes vinham falhando
# silenciosamente ha semanas, sem que nada no fluxo de deploy dependesse
# do push ter funcionado.
#
# Uso: chamado no INICIO de deploy.sh (backend) e deploy-frontend.sh
# (frontend), antes de qualquer build. Se o push falhar por qualquer
# motivo, este script sai com erro e o deploy chamador (com `set -e`) para
# junto -- nunca prossegue um deploy que nao sincronizou com o GitHub.
#
# Escopo por path (backend/ ou frontend/), nao o repo inteiro: os dois
# deploys sao processos independentes, e o working tree costuma ter
# mudancas nao commitadas do OUTRO lado que ainda nao estao prontas pra ir
# pra main (ex.: lote pendente/nao testado). Commitar tudo em bloco
# arriscaria empurrar pra main codigo que nao faz parte deste deploy.
set -euo pipefail

# REPO_ROOT/DEPLOY_REMOTE sao sobrescreviveis via env var so para permitir
# testar este script contra um repo/remote descartavel (ver
# PENDING_ACTIONS.md, teste em devtest) -- em uso normal, sempre os
# defaults de producao abaixo.
REPO_ROOT="${GIT_SYNC_REPO_ROOT:-/opt/sigcr}"
SCOPE="${1:?uso: git-sync-or-die.sh <backend|frontend> [label]}"
LABEL="${2:-$SCOPE}"
DEPLOY_REMOTE="${GIT_SYNC_DEPLOY_REMOTE:-git@github-sigcr-deploy:prbiomedico/CREDENCIAMENTO.git}"
BRANCH="main"

cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "ERRO [$LABEL]: branch atual e '$CURRENT_BRANCH', esperado '$BRANCH'." >&2
  echo "Troque para '$BRANCH' antes de rodar o deploy." >&2
  exit 1
fi

if [ -n "$(git status --porcelain -- "$SCOPE")" ]; then
  echo "[$LABEL] Mudancas nao commitadas detectadas em $SCOPE/, criando auto-commit..."
  git add -- "$SCOPE"
  git commit -m "auto-commit pre-deploy ($LABEL): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  echo "[$LABEL] Nenhuma mudanca pendente em $SCOPE/."
fi

echo "[$LABEL] Sincronizando com o GitHub ($BRANCH)..."
if ! git push "$DEPLOY_REMOTE" "HEAD:refs/heads/$BRANCH"; then
  echo "" >&2
  echo "ERRO [$LABEL]: push para o GitHub falhou. DEPLOY INTERROMPIDO." >&2
  echo "Nao prosseguir sem sincronizar com o GitHub primeiro -- foi exatamente" >&2
  echo "essa lacuna que deixou producao 16 commits a frente do git antes." >&2
  echo "Verifique: credencial SSH (~/.ssh/sigcr_deploy_key registrada como" >&2
  echo "Deploy Key com write access no GitHub), conectividade, ou conflito" >&2
  echo "com origin/$BRANCH (alguem pode ter commitado direto no GitHub)." >&2
  echo "Resolva e rode o deploy de novo -- o auto-commit acima ja foi feito" >&2
  echo "localmente, nao precisa refazer." >&2
  exit 1
fi

echo "[$LABEL] Push confirmado. Prosseguindo com o deploy."
