# Pending Actions — histórico do deploy de 2026-07-27

Gerado pelo Claude Code em 2026-07-27. Itens 1 e 2 foram aprovados pelo Pedro e
executados nesta mesma data (ver detalhes de cada um). Este arquivo agora serve
de registro do que foi feito e da investigação do incidente ocorrido durante o
deploy — não há mais ações pendentes de aprovação neste momento.

## 1. Deploy do CRUD de documentos + fix do include_router (backend) — ✅ CONCLUÍDO

**Contexto:** commit de checkpoint `1732e92` (+ `fe1c459` de limpeza dos `.bak`)
em `/opt/sigcr` (branch `main`, local, não pushado) contém o módulo `documentos_gov`
completo (models, upload/list/get/download/versões/patch/delete), a Matriz RACI e a
correção de `app.include_router(api_router)` (movido para o fim de `backend/server.py`).
Testado com sucesso em ambiente isolado antes do deploy (Mongo descartável
`sigcr-mongo-devtest` + Keycloak real com usuário/redirect URI temporários, já
removidos).

**Executado:**
```bash
docker tag sigcr-backend sigcr-backend:pre-documentos-rollback-20260727  # safety net
cd /opt/sigcr
docker build -t sigcr-backend backend/
docker stop sigcr-backend && docker rm sigcr-backend
docker run -d --name sigcr-backend --restart unless-stopped \
  --network sigcr-net -p 8003:8000 --env-file backend/.env sigcr-backend
```
Rollback disponível via `docker run ... sigcr-backend:pre-documentos-rollback-20260727`
se necessário (imagem antiga preservada com essa tag).

**Incidente durante o deploy — usuário `sigcr` ausente no Mongo:** ao subir o novo
container ele entrou em crash loop com `pymongo.errors.OperationFailure: Authentication
failed.`. Confirmei que isso era independente do rebuild (a mesma credencial falhava
via `mongosh` direto no `sigcr-mongodb`). Usando a conta root do Mongo (`naxxos`, já
acessível via `docker inspect`), descobri que **o usuário `sigcr` simplesmente não
existia** em `admin.system.users` — só `naxxos` (root). Os dados do banco `sigcr`
(coleções `users`, `companies`, `credenciamentos`) estavam intactos.

Investigação da causa raiz (com aprovação do Pedro):
- Logs do `sigcr-mongodb` (histórico completo desde a criação do container em
  `2026-07-25T06:18:06Z`, sem truncamento — 12759 linhas) não têm **nenhum**
  evento `dropUser`/`createUser` para `sigcr` em toda a vida do container.
- A primeira falha de autenticação (`UserNotFound: Could not find user "sigcr"`)
  aparece em `2026-07-26T12:48:28Z` — ou seja, o usuário já não existia desde ~30h
  antes do incidente ser percebido.
- O container `sigcr-backend` antigo continuou funcionando normalmente nesse
  período inteiro porque o pool de conexões do Motor/PyMongo mantinha conexões já
  autenticadas de antes; só ao reiniciar o container (forçando conexões 100% novas)
  o problema ficou visível e fatal.
- **Hipótese mais provável:** alguma rotina de backup/restore da base `sigcr`
  (mongodump/mongorestore por database) recriou/restaurou as coleções de
  `sigcr` sem incluir o usuário correspondente em `admin.system.users` — que
  vive num banco lógico separado (`admin`) e não é coberto por um dump do banco
  `sigcr` sozinho. Isso explicaria dados intactos + usuário ausente + nenhum log
  de `dropUser` explícito. Não encontrei uma rotina de backup agendada (sem
  crontab/systemd timer específico para isso), então não consigo confirmar o
  gatilho exato — só a assinatura do problema.
- Achado relacionado (não confirmado como causa, mas no mesmo território de
  drift de credenciais): `backend/.env` também tinha duas linhas de
  `KEYCLOAK_ADMIN_PASSWORD` com valores diferentes (a antiga foi removida, ver
  item 2). Sugere que alguma rotação/reprovisionamento de segredos aconteceu em
  algum momento sem atualização consistente de todos os lugares.

**Correção aplicada:** recriado o usuário `sigcr` em `admin.system.users` com a
mesma senha já documentada em `.env`/`.naxxos-secrets`
(`X6kpIQZIAEfmJEwxNQQciMQIQ4`) e role mínima `readWrite` no banco `sigcr` (sem
privilégio de root). Container reiniciado com sucesso depois disso.

**Recomendação para o Pedro:** vale confirmar se existe alguma rotina de
backup/restore do Mongo rodando fora do crontab/systemd deste host (ex.: script
externo, cron de outro processo, ferramenta de hardening "naxxos" mencionada nos
arquivos de instalação) que possa ter causado isso — para evitar que se repita.

## 2. Limpeza pré-deploy — ✅ CONCLUÍDO

- `backend/.env`: removida a linha 9 (`KEYCLOAK_ADMIN_PASSWORD` antiga/stale),
  mantida a linha 15 (valor correto, confirmado por autenticação real no Keycloak
  durante o teste isolado). Arquivo não é versionado (`.gitignore`), então não
  gerou commit.
- Removidos do repo (commit `fe1c459`): `backend/server.py.bak`,
  `frontend/src/App.js.bak`, `frontend/src/pages/Empresas.js.bak`,
  `frontend/src/pages/Landing.js.bak`, `frontend/src/pages/Portarias.js.bak`,
  `frontend/src/pages/Portarias.js.bak2`. Preservados no histórico via commit de
  checkpoint `1732e92`, caso precise recuperar algo.
- `frontend/package-lock.json`: aprovado como está, sem mudanças.

## 3. Deploy do frontend — ✅ CONCLUÍDO

**Executado:**
```bash
cd /opt/sigcr/frontend
cp -r build build.pre-documentos-rollback-20260727   # backup do build antigo
npm ci --legacy-peer-deps   # necessário: conflito de peer-dep date-fns@4 vs
                            # react-day-picker@8 (pré-existente no package.json,
                            # não introduzido agora); npm install/ci sem a flag falha
npm run build
```
Build concluído sem erros (só warnings de ESLint sobre deps de hooks, não
bloqueantes). nginx serve direto de `/opt/sigcr/frontend/build`, sem precisar
reload. Backup do build anterior em `frontend/build.pre-documentos-rollback-20260727/`
caso precise reverter.

## 4. Achado de teste ainda em aberto (débito técnico, não bloqueante)

`EmailStr` do Pydantic rejeita e-mails com TLD reservado (ex.: `.local`) e isso é
engolido pelo `except Exception` genérico em `get_current_user` (`backend/server.py`),
retornando "Token inválido" em vez de um erro claro. Não afeta usuários reais
(nenhum domínio `.local`/`.test`/`.example` em produção). Fica só documentado
para um ajuste futuro de tratamento de erro (log mais específico), sem prazo.

## 5. Investigação da causa raiz + correções preventivas — ✅ CONCLUÍDO (2026-07-27)

**Causa raiz confirmada** (investigação mais profunda, aprovada pelo Pedro):
- O container `sigcr-mongodb` **nunca reiniciou** desde sua criação em
  `2026-07-25T06:18:07Z` (`RestartCount=0`, confirmado também via
  `local.startup_log` do próprio Mongo: só 2 boots, ambos do bootstrap inicial).
  Isso descarta com evidência as duas hipóteses anteriores: rotina de
  backup/restore da base `admin` e restart de container sem volume
  persistente — nenhuma das duas é fisicamente possível sem um restart/restore,
  que não ocorreu.
- Nenhuma rotina de cron/systemd neste host toca o Mongo (checado
  `/etc/cron.d`, `cron.{daily,hourly,weekly}`, `crontab -l root`, todos os
  `*.timer`).
- O log do próprio `mongod` (vida inteira do container, ~12,8k linhas) não tem
  nenhum `createUser`/`dropUser` registrado — para nenhum usuário. Isso é
  esperado: por padrão o Mongo só loga comandos administrativos rápidos se
  passarem do `slowms`, e essa instância standalone não tem oplog para
  reconstruir o histórico.
- O `.bash_history` do root não alcança a janela do incidente (25/26 de
  julho) — `HISTFILESIZE` estava em 2000 e o arquivo tinha sido reescrito em
  2026-07-27T12:10Z, fora da janela relevante.
- **O que ficou confirmado**: a falha só ficou visível às
  `2026-07-26T12:48:28Z` porque o container `sigcr-backend` reiniciou 24s
  antes (`2026-07-26T12:48:04Z`, visto no `journalctl -u docker`) — o processo
  antigo mantinha conexões já autenticadas; a reinicialização forçou conexões
  novas, que bateram de frente no usuário já ausente. O `sigcr-backend`
  reiniciou 4 vezes naquele dia (11:37, 12:48, 12:51, 12:58) sem nenhum evento
  correspondente de restart do `dockerd`/host — ou seja, foram reinícios
  pontuais do container, não um evento de infraestrutura.
- **Conclusão**: nenhum job automatizado apagou o usuário `sigcr`. O mecanismo
  exato de remoção (comando manual ou de aplicação) não é recuperável
  forensicamente — não há auditoria de comandos rápidos habilitada, não há
  oplog nesta instância standalone, e o bash_history já tinha rotacionado.
  As correções abaixo fecham exatamente essas três lacunas para que isso não
  se repita sem deixar rastro.

**Correções implementadas:**

1. **Log level do Mongo elevado para capturar `createUser`/`dropUser`.**
   MongoDB Community (`mongo:7`, esta imagem) não tem `auditLog` nativo
   (é recurso Enterprise), então a alternativa foi subir a verbosidade dos
   componentes `command` e `accessControl` via `db.setLogLevel(1, ...)`
   direto no `sigcr-mongodb` em execução. Testado e confirmado: um
   `createUser`/`dropUser` de teste agora aparece no log com o comando
   completo, database e conexão de origem. **Ressalva importante:** isso é
   uma configuração *runtime* (via `setLogLevel`), que **não sobrevive a um
   restart do container** — como o `RestartPolicy` do `sigcr-mongodb` é `no`
   e ele não reinicia sozinho, fica valendo até a próxima recriação
   intencional do container. Na próxima vez que `sigcr-mongodb` for
   recriado, adicionar `--setParameter
   logComponentVerbosity='{"command":{"verbosity":1},"accessControl":{"verbosity":1}}'`
   ao `docker run` (ou equivalente em `mongod.conf`) para tornar isso
   permanente. Efeito colateral aceito: verbosidade `command=1` loga
   basicamente todo comando (não só administração de usuários), o que consome
   mais rápido a rotação de log existente (`json-file`, `max-size=10m,
   max-file=3`, ~30MB total) — mitigado pelo item 3 abaixo, que detecta em
   minutos independente do log.

2. **Histórico de shell do root aumentado.** `/root/.bashrc`:
   `HISTSIZE` 1000→10000, `HISTFILESIZE` 2000→20000, e adicionado
   `HISTTIMEFORMAT="%F %T  "` (timestamp em cada linha do `history`). Vale
   para novas sessões de shell a partir de agora.

3. **Script de alerta para usuário sumido.** Criado
   `/usr/local/bin/mongo-user-watch.sh`, que roda a cada 5 minutos via
   `/etc/cron.d/mongo-user-watch` e verifica se `naxxos` e `sigcr` continuam
   em `admin.system.users` do `sigcr-mongodb`. Se algum sumir (ou o
   container cair), grava um `CRITICAL` em `/var/log/mongo-user-watch.log`
   **e** manda para o syslog/journald via `logger -t mongo-user-watch`
   (visível com `journalctl -t mongo-user-watch`), além de tentar `wall` para
   sessões ativas. Testado nos dois cenários (estado OK e alerta simulado) —
   funcionando. Não há e-mail configurado neste host (sem `postfix`/`sendmail`/
   `msmtp`); se quiser alerta por e-mail no futuro, precisa de um MTA/relay
   configurado antes.

## 6. Incidente de deploy do frontend — `.env.production` ausente no worktree de build — ✅ CONCLUÍDO (2026-08-01)

**O que aconteceu:** o padrão de deploy do frontend usado desde 2026-07-30
(build isolado num worktree persistente em `/tmp/sigcr-build-<ts>/frontend`,
sincronizado via `rsync .../frontend/src/ .../frontend/src/`) só copia a pasta
`src/`. O `.env.production` vive na raiz de `frontend/`, fora de `src/`, e
**nunca foi copiado pro worktree**. No deploy de 2026-07-31 (interceptor
axios + mensagens de erro + fix de race condition), isso passou despercebido
porque `npm run build` sem `REACT_APP_BACKEND_URL` definida não falha — o
Create React App só deixa a variável `undefined` em tempo de execução.

**Efeito em produção:** qualquer arquivo que montava a URL da API como
`` `${process.env.REACT_APP_BACKEND_URL}/api` `` sem fallback virou
`https://sigcr.com.br/undefined/api/...` no navegador — que nunca chega no
backend (cai no fallback de SPA do nginx, `try_files ... /index.html`,
retornando 200 com HTML). 14 arquivos afetados: `Documentos.js`,
`Empresas.js`, `Transparencia.js`, `Portarias.js`, `Estados.js`,
`EstadoDetalhe.js`, `CriarEvento.js`, `Notificacoes.js`, `Editais.js`,
`Esteiras.js`, `GestaoUsuarios.js`, `DashboardLayout.js`,
`QueridoDiarioBusca.js`, `DocumentosEstadoTab.js`. Dois arquivos já tinham
fallback (`hooks/useApi.js`, `SolicitacaoDetalhe.js`) e por isso continuaram
funcionando normalmente — foi assim que o bug ficou parcialmente mascarado
(Dashboard/`/stats` funcionando enquanto Documentos/Empresas quebravam).

**Como foi achado:** Pedro reproduziu o bug com DevTools aberto e viu a
URL literal `.../undefined/api/companies` na aba Network.

**Correção aplicada:**
1. Todos os 14 arquivos agora usam
   `process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br'`,
   igual ao padrão que já existia em `useApi.js`/`SolicitacaoDetalhe.js` —
   mesmo que o `.env.production` volte a faltar num build futuro, a URL
   correta de produção é o fallback.
2. `.env.production` copiado manualmente pro worktree persistente antes do
   rebuild de 2026-08-01.

**⚠️ Ação de processo obrigatória daqui pra frente:** todo deploy de
frontend que use o padrão de worktree (`rsync` + `npm run build` isolado)
**precisa copiar `.env.production` pro worktree antes do build** — não é
coberto pelo `rsync .../src/ .../src/`. Comando a adicionar sempre antes do
`npm run build`:
```bash
cp /opt/sigcr/frontend/.env.production /tmp/sigcr-build-<ts>/frontend/.env.production
```
O fallback do item acima (1) é uma segunda camada de proteção, não substitui
esse passo — variáveis que não têm fallback hardcoded (nenhuma hoje, mas
podem existir no futuro) continuariam quebrando silenciosamente sem ele.
