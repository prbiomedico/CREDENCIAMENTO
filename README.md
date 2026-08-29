# SIGCR

Sistema de credenciamento de registradoras (backend FastAPI + Mongo, frontend CRA), rodando via Docker neste host.

## Deploy do backend — SEMPRE via `backend/deploy.sh`

**Nunca rode `docker build`/`docker run` manualmente pro `sigcr-backend`.** Use:

```bash
cd /opt/sigcr/backend && ./deploy.sh
```

Esse script garante, em todo rebuild:
- Tag de rollback da imagem anterior antes de buildar a nova.
- **Bind mount de `backend/uploads/` para `/app/uploads`** dentro do container — sem isso, documentos enviados por usuários ficam só na camada gravável do container e são **perdidos no próximo rebuild**. Ver incidente completo em `PENDING_ACTIONS.md`.
- Verificação pós-deploy de que o mount realmente pegou (o script falha com erro explícito se não pegou, em vez de deixar passar em silêncio).

Se por qualquer motivo precisar rodar o `docker run` manualmente (não deveria), o mount obrigatório é:

```bash
-v /opt/sigcr/backend/uploads:/app/uploads
```

## Deploy do frontend

Build isolado em worktree (nunca em cima do `frontend/` de produção) + swap atômico do symlink `frontend/current`. Ver `PENDING_ACTIONS.md` pro histórico completo do padrão e dos incidentes que levaram a ele.
