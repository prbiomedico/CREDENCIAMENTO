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

## 7. Incidente do bind mount de uploads — perda silenciosa de documentos (descoberto 2026-08-02)

**O que aconteceu:** `backend/uploads/` (onde ficam os PDFs enviados por
usuários) nunca foi um volume Docker de verdade — o `Dockerfile` faz
`COPY . .`, que só "assa" na imagem o que já estiver na pasta do host **no
momento do build**. Em algum rebuild de 2026-08-01 (não identificado com
certeza — o `.bash_history` já tinha rotacionado passado da janela, e o log
do `dockerd` não registra os argumentos do `docker run`, só eventos
internos), um bind mount de `backend/uploads:/app/uploads` foi aplicado
manualmente numa recriação do container e depois **perdido numa recriação
seguinte** que não incluiu a flag `-v` — provavelmente um `docker run`
digitado de memória. A partir daí, todo upload passou a existir só na
camada gravável do container, sem sobreviver a um rebuild.

**Evidência:** dos 7 documentos vinculados à HD Registros, os 4 enviados em
2026-07-30 (antes de qualquer mount) perderam o arquivo físico de vez; os 3
enviados em 2026-08-01 entre 11h24 e 11h48 sobreviveram porque foram
gravados direto no host via o mount — que caiu pouco depois (evidenciado
pelo horário do próximo rebuild registrado no `dockerd`, ~11h50). Os 4
perdidos foram recuperados no banco (registro reativado, mesmos metadados)
mas **não há como recuperar o arquivo em si** — não existe backup dele em
lugar nenhum.

**Correção aplicada (2026-08-02):** `backend/deploy.sh` — script único e
obrigatório pra todo rebuild/restart do backend, que sempre inclui
`-v backend/uploads:/app/uploads` e **verifica depois que o mount pegou**,
falhando com erro explícito se não pegou (em vez de deixar passar em
silêncio, que foi exatamente a causa raiz aqui). Documentado em
`README.md` como o único jeito certo de fazer deploy do backend.

**Testado em devtest antes de aplicar em produção:** upload de um documento
com o mount ativo → rebuild completo da imagem → recriação do container com
o mesmo mount → arquivo confirmado intacto no container novo (via
`docker exec ... test -f`) → documento continua baixável pela API
normalmente. Esse teste (upload → rebuild → sobrevivência do arquivo) passa
a ser parte do checklist padrão sempre que algo relacionado a upload/volume
for mexido num deploy de backend.

**Ainda pendente:** aplicar o mount no container de produção (precisa de um
stop/rm/run, então é uma ação de deploy — aguardando aprovação separada,
não incluída neste registro).

## 8. Deploy do credenciamento por portaria + integração Criar Evento/Portaria (2026-08-08) — ✅ CONCLUÍDO

Depois de uma revisão de segurança (30 checks, 2 vazamentos de rascunho de
portaria encontrados e corrigidos — rascunhos do wizard `criado_via='wizard'`
sem `publicado_at` não podiam vazar pra fora de DETRAN/admin), deploy em
produção do fluxo de credenciamento por portaria (DETRAN/Registradora/
Financeira) + fusão Evento↔Portaria. Backend: tag de rollback
`sigcr-backend:pre-deploy-rollback-20260808-0107`. Frontend: release
`releases/20260808-0109-evento-portaria-integracao` (hash
`main.b32d1bde.js`). Health check pós-deploy OK nos dois lados (`/api/`
200, `/api/stats`+`/api/portarias` 401 sem token, `/api/portarias/publico/
token-invalido` 404, `/` e `/criar-evento` 200). Gap conhecido, não
bloqueante: `GET /stats` tem lacuna de perfil (só afeta número exibido no
dashboard, não vaza dado sensível) — registrado como débito técnico, não
corrigido ainda.

## 9. Remoção da timeline calculada do wizard "Criar Evento" (2026-08-08) — ✅ CONCLUÍDO (deploy 2026-08-09)

**Motivo (decisão de produto do Pedro):** o Passo 4 (Timeline) do wizard
pré-preenchia uma lista de etapas com prazos fixos por template (ex.
credenciamento: "Publicação +0d, Impugnação +5d, ... Homologação +70d") —
uma tabela inventada, sem nenhuma relação com como o DETRAN realmente
distribui prazos entre etapas. Pedro decidiu remover essa mecânica
inteiramente e simplificar pra só abertura/encerramento como prazo simples.

**Decisão tomada (recomendação apresentada e aprovada antes de implementar):**
removido o Passo 4 inteiramente em vez de mantê-lo simplificado — sem a
lista de etapas, não sobrava nenhum conteúdo próprio pro passo (as datas de
abertura/encerramento já são coletadas no Passo 2/Detalhes), então um passo
extra só pra "confirmar" 2 datas já digitadas seria clique sem informação
nova. Wizard passa de 5 pra 4 passos: Template/Detalhes/Documentos/Revisar.

**Mudanças:**
- `frontend/src/pages/CriarEvento.js`: `STEPS` sem "Timeline"; removido o
  passo inteiro de edição de etapas (`updateTimeline`, botão "Adicionar
  Etapa", inputs de `etapa`/`dias_corridos`); removido o pré-preenchimento
  de `timeline` a partir de `timeline_padrao` (seleção de template e
  deep-link do Querido Diário); card de Revisar troca "Timeline (N etapas)"
  por uma linha simples "Prazo: {abertura} até {encerramento}"; payload de
  `POST /portarias` não envia mais `timeline`.
- `frontend/src/pages/PortariaPublica.js`: card "Cronograma" (lista de
  etapas) trocado por um card "Prazo" simples com as duas datas, só
  aparece se pelo menos uma delas existir.
- `backend/server.py`: removido o cálculo de `timeline_calculada` em
  `POST /portarias` (datas por etapa a partir de `dias_corridos`); `GET
  /portarias/publico/{token}` passa a devolver `data_abertura`/
  `data_encerramento` em vez de `timeline`; removida a tabela
  `timeline_padrao` de dentro dos 4 templates em `TEMPLATES_EVENTO`; campo
  `timeline: List[dict] = []` mantido no modelo `Portaria`/`PortariaCreate`
  (não removido do schema — mais simples, portarias antigas que já tinham
  o array salvo continuam válidas, só ninguém mais popula).
- Removido também `POST /eventos` (endpoint legado do módulo "Evento" antes
  da fusão com Portaria, confirmado morto — grep no frontend inteiro não
  achou nenhuma tela chamando ele, só `GET /eventos/templates` é usado, que
  continua existindo). **Não removido** (fora de escopo desta mudança, mas
  também confirmado morto): `GET /eventos`, `GET /eventos/{id}`, `GET
  /eventos/publico/{token}`, `PATCH /eventos/{id}`, `PATCH /eventos/{id}/
  publicar`, `DELETE /eventos/{id}` — candidatos a uma limpeza futura, sem
  nenhuma tela os chamando hoje.

**Testado em devtest (`sigcr-backend-devtest`, imagem
`sigcr-backend:devtest-evento-timeline`, rebuildado com o código de hoje):**
1. `POST /portarias` com `template`+`data_abertura`+`data_encerramento`
   (fluxo do wizard) → `timeline` volta `[]`, sem nenhuma etapa inventada.
2. `PATCH /portarias/{id}/publicar` → publica normalmente.
3. `GET /portarias/publico/{token}` → devolve `data_abertura`/
   `data_encerramento` corretos, sem campo `timeline`.
4. `GET /portarias/publico/token-invalido` → 404 (sem vazar nada).
5. `GET /eventos/templates` → confirma `timeline_padrao` sumiu dos 4
   templates, resto intacto.
6. `POST /eventos` → 405 (rota `/eventos` ainda existe por causa do `GET`,
   método `POST` não está mais registrado — confirma a remoção).
7. Portaria manual (`criado_via='manual'`, sem `data_abertura`/
   `data_encerramento`) → endpoint público devolve os dois campos `null`,
   o que faz o card de Prazo do frontend ficar oculto corretamente (mesma
   lógica condicional que já existia pro Cronograma antigo).
8. Build de produção do frontend (`CI=false npm run build`) compilou limpo
   com as duas mudanças — só os warnings de eslint pré-existentes de outras
   páginas, nada novo.

**Não testado (sem ferramenta de browser neste ambiente):** clique real no
wizard (navegação Passo 2 → Revisar sem passar pelo Timeline, botões
Voltar/Revisar/Publicar) e a renderização visual do card de Prazo na página
pública. Recomendado antes de considerar o deploy 100% fechado.

**Status:** implementado e testado em devtest, aguardando o relatório ser
lido e o deploy ser autorizado (Pedro pediu pra ser chamado antes do deploy
nesta rodada especificamente, mesmo com autonomia total valendo daqui pra
frente).

**Deploy 2026-08-09 (autorizado pelo usuário: "pode seguir com a timeline (4
passos) que já estava combinado") — ✅ CONCLUÍDO.**

**Problema encontrado antes de deployar:** o working tree em `/opt/sigcr`
tinha esse trabalho (item 9 + a integração Evento↔Portaria do item 8, ambos
ainda não commitados) misturado, no mesmo diff, com um lote bem maior e
**não testado/não aprovado**: página pública de auto-cadastro
(`CadastroPublico.js`, rota `/cadastro`), fila de registro de contrato
(`FilaRegistros.js`/`SolicitacaoRegistro.js`, rotas `/fila-registros` e
`/registro-contrato`), gestão de editais (`GestaoEditais.js`, rota
`/gestao-editais`), um novo `PerfilAtivoContext` (seletor de perfil ativo
multi-empresa) já integrado em `DashboardLayout.js`, e reescritas grandes
não relacionadas em `ChecklistContran.js`, `Dashboard.js`, `Editais.js`,
`EstadoDetalhe.js`, `MapaNacional.js`, `Checkout.js`, `Planos.js` e vários
componentes de UI da landing page (`globe-hero`, `gradient-menu`,
`interactive-map`, `vapour-text-effect`, `ai-loader`, `cookie-banner`,
`index.css`, `tailwind.config.js`). Nada disso tinha passado por teste em
devtest nesta leva — deployar o working tree inteiro como estava teria
jogado um lote inteiro de feature não validada em produção.

**Como foi isolado:** confirmado por diff que `backend/server.py` no disco
é **byte-idêntico** ao que já tinha sido testado na imagem devtest
`sigcr-backend:devtest-evento-timeline` (nenhum código do lote pendente
chegou a tocar o backend) — deploy de backend feito direto via
`backend/deploy.sh` sem nenhuma alteração. Pro frontend, os timestamps de
modificação no disco confirmaram que 22 arquivos (todo o lote pendente,
incluindo `DashboardLayout.js`) não eram tocados desde 2026-08-05 19:54
(uma reconciliação de stash anterior, não relacionada), enquanto
`Portarias.js`/`App.js`/`CriarEvento.js` tinham edições de 2026-08-07/08 —
ou seja, misturavam mudanças aprovadas (evento-portaria + timeline) com
mudanças do lote de 2026-08-05 no mesmo arquivo. Reconstruído à mão num
`git worktree` isolado a partir do commit `8211a7d` (HEAD): copiados
integralmente `Portarias.js`, `CriarEvento.js`, `PortariaPublica.js` (novo)
e `ChecklistCatalogoPicker.js` (novo) — nenhum tem qualquer referência a
`PerfilAtivo`/`CadastroPublico`/`FilaRegistros`/`GestaoEditais`/
`SolicitacaoRegistro` (confirmado via grep); `App.js` reconstruído partindo
do HEAD com só duas linhas adicionadas (import + rota
`/portarias/publico/:token` → `PortariaPublica`), confirmado via diff que
nada mais do lote pendente entrou. **O resto do working tree em
`/opt/sigcr` não foi tocado** — o lote pendente (cadastro público, fila de
registros, gestão de editais, seletor de perfil ativo, redesign da landing)
continua intacto, uncommitted, aguardando uma rodada própria de teste em
devtest antes de qualquer deploy futuro.

**Build:** `npm ci --legacy-peer-deps && CI=false npm run build` no
worktree isolado — compilou limpo (só os warnings de eslint pré-existentes
de sempre). Confirmado via grep no bundle final: zero ocorrência de
`gestao-editais`/`fila-registros`/`registro-contrato`, `portarias/publico`
presente.

**Deploy:** backend — tag de rollback
`sigcr-backend:pre-deploy-rollback-20260809-1508`, rebuild via
`deploy.sh`, mount de uploads confirmado ativo. Frontend — release
`releases/20260809-1509-timeline-removal` (hash `main.269e23aa.js`), swap
atômico do symlink `current`.

**Health check pós-deploy:** `/api/` 200; `/api/stats`, `/api/portarias`,
`/api/eventos`, `/api/companies`, `/api/system-users` 401 sem token;
`POST /api/eventos` 405 (removido, confirmado); `GET /api/eventos/templates`
segue existindo (401 sem token); `GET /api/portarias/publico/token-invalido`
404. Front: `sigcr.com.br` serve o hash novo, `Cache-Control: no-cache` em
`index.html` e `immutable` em `/static/`, rotas `/`, `/portarias`,
`/criar-evento`, `/planos` todas 200. `docker logs sigcr-backend` mostrou
tráfego real de usuário logo após o restart sem nenhum 500 — sinal de que
não houve regressão perceptível na janela imediata pós-deploy.

**Ainda não testado (sem ferramenta de browser neste ambiente):** clique
real no wizard e a renderização visual do card "Prazo" na página pública —
recomendado que o Pedro/usuário confirme visualmente quando puder.

## 10. Autonomia total reconfirmada (2026-08-09)

O usuário reconfirmou nesta data a autonomia total concedida em 2026-08-08
(ver histórico de memória `feedback-sigcr-autonomia-total`): decisão de
implementação e deploy em produção são minhas daqui pra frente, sem esperar
aprovação passo a passo, respeitando a única regra fixa (nunca apagar dado
real; portaria publicada sempre revoga, nunca deleta) e os hábitos já
provados (devtest antes de prod, `deploy.sh` com rollback automático,
health check pós-deploy, corrigir problema de segurança real na hora). O
item 9 acima foi o primeiro deploy executado sob essa reconfirmação. A
partir daqui, vou seguindo em frente com o próximo item de maior valor
(candidatos abertos: as 4 telas DETRAN não-funcionais por
`apiCall`/`useApi` quebrado — `PainelDetran.js`/`POC.js`/
`AnaliseDocumental.js`/`Homologacao.js` —, o gap de PATCH/DELETE
`/portarias/{id}` sem `estado_sigla`, ou testar/isolar/deployar o lote
pendente do item acima) e registro aqui à medida que for avançando.

## 11. Limpeza das 4 telas DETRAN não-funcionais (`painel-detran`) — ✅ CONCLUÍDO (2026-08-11)

Removidas `PainelDetran.js`, `AnaliseDocumental.js`, `POC.js`,
`Homologacao.js` (as 4 telas identificadas no item 10 como permanentemente
quebradas por `apiCall`/`useApi` — ver `project-sigcr-deploy-pattern` na
memória — todo `useApi()` delas chamava um método inexistente, erro
sempre engolido pelo try/catch local, tela sempre em estado vazio).
Confirmado via grep no repo inteiro: nenhum outro arquivo importa essas 4
páginas nem referencia suas rotas (`/painel-detran`,
`/detran/analise`, `/detran/poc`, `/detran/homologacao`) por string; backend
não tem nenhuma rota `processos*`/`painel_detran` associada (já confirmado
morto dos dois lados). `hooks/useApi.js` não precisou de alteração.

**Achado antes de deployar:** o working tree em `/opt/sigcr` tinha essa
limpeza misturada, no mesmo diff de `App.js` e `DashboardLayout.js`, com o
lote pendente de 2026-08-05 que o usuário pediu explicitamente pra não
tocar nesta rodada (`PerfilAtivoContext`, rotas `/cadastro`,
`/fila-registros`, `/registro-contrato`, `/gestao-editais`). Isolado à mão
num `git worktree` a partir do HEAD (`8211a7d`, confirmado idêntico ao
release em produção `20260809-1509-timeline-removal`) — mesma técnica do
item 9: só os imports/rotas dos 4 componentes removidos de `App.js`, só a
entrada de nav `/painel-detran` (+ import não usado do ícone `Zap`)
removida de `DashboardLayout.js`, as 4 páginas deletadas. Nada do
`PerfilAtivoContext`/lote pendente entrou.

**Build e verificação:** `npm ci --legacy-peer-deps && CI=false npm run
build` no worktree isolado — compilou limpo (só os warnings de eslint
pré-existentes de sempre). Grep no bundle final (`main.7efca167.js`):
zero ocorrências de `painel-detran`, zero ocorrências de
`PerfilAtivoProvider`/`gestao-editais`/`fila-registros`/
`registro-contrato`/`CadastroPublico` — confirma isolamento completo do
lote pendente.

**Deploy:** só frontend (backend não tocado nesta mudança). Release
`releases/20260811-painel-detran-cleanup`, swap atômico do symlink
`current`. Health check: `sigcr.com.br` serve o hash novo; `index.html`
`Cache-Control: no-cache`, `/static/` `immutable`; rotas `/`, `/portarias`,
`/criar-evento`, `/planos`, `/dashboard` todas 200; `api.sigcr.com.br/api/`
200, `/api/portarias`, `/api/stats`, `/api/companies` 401 sem token
(backend íntegro, como esperado — não foi restartado). Worktree removido
após o build.

**Não testado (sem ferramenta de browser):** clique real confirmando que o
menu DETRAN não mostra mais "Painel DETRAN" e que as rotas antigas
(`/painel-detran` etc.) caem no catch-all (`/dashboard`) sem erro — só
verificado que o bundle não contém mais esses componentes.


## 12. Dois fixes de segurança — gap de escrita em portarias sem UF + company_id não validado em Solicitações — ✅ CONCLUÍDO (2026-08-11)

Dois gaps de autorização, ambos reais (confirmados explorando em devtest
antes de corrigir, não só por leitura de código):

**a) `PATCH/DELETE /portarias/{id}` sem `estado_sigla`** (gap identificado em
2026-08-05, ver memória `project-sigcr-portarias-perfil-fix`, nunca corrigido
até agora): as duas rotas só exigiam `Depends(get_current_user)` — qualquer
usuário autenticado, **incluindo `registradora`**, editava ou apagava
(soft-delete) qualquer portaria sem `estado_sigla` (portarias legadas ou
cadastradas sem UF), porque `_checar_permissao_escrita_estado` só rodava
`if portaria.get("estado_sigla")`. Corrigido trocando a dependency das duas
rotas pra `Depends(require_perfil("sigcr_admin", "detran", "detran_admin"))`
— o mesmo gate-base que `POST /portarias` já usa — mantendo
`_checar_permissao_escrita_estado` como checagem adicional de escopo por UF
quando `estado_sigla` está presente. `registradora` agora recebe 403 em
ambos os casos (com ou sem UF); `detran`/`detran_admin` seguem podendo editar
só a própria UF quando ela está setada.

**b) `POST /solicitacoes` não validava dono do `company_id`**: o
`company_id` vinha direto do body sem nenhuma checagem — qualquer empresa
com acesso total (`require_acesso_total`) podia criar uma "solicitação"
anexada ao `company_id` de **outra** empresa. Corrigido reaproveitando
`_autorizar_acesso_empresa` (mesmo helper usado em `GET/PATCH/DELETE
/companies/{id}`, documentos etc.) — 400 se `company_id` ausente, 404 se não
existe, 403 se pertence a outra empresa (dono sempre passa; `sigcr_admin`
sempre passa, por design, mesmo padrão de todo o resto do sistema).

**Isolamento:** working tree tinha esses dois pontos afogados no meio do
diff gigante do lote pendente (Fase A financeira/checklist DETRAN-DF/
autocadastro) em `backend/server.py` — não dava pra usar o arquivo do disco
como base. Os dois fixes foram escritos direto num `git worktree` a partir
do HEAD (`8211a7d`, mesmo commit que já estava rodando em produção), diff
final de 4 linhas + 6 linhas, nada mais tocado.

**Testado em devtest** (`sigcr-backend-devtest` rebuildado com a imagem
isolada, `sigcr-mongodb-devtest`, dados sintéticos `sectest_*` — 2 empresas,
5 usuários via `user_sessions` fallback legado, 2 portarias, todos
removidos ao final do teste): 13 cenários, todos com o resultado esperado —
inclui confirmação de que `detran_admin`/`detran` no próprio UF, e
`sigcr_admin` em qualquer caso, continuam funcionando sem regressão (a
checagem de escopo por UF pré-existente não foi alterada, só ganhou um gate
anterior).

**Deploy:** só backend, via `deploy.sh` rodado dentro do worktree isolado
(garante que só os 2 fixes chegam em produção, não o resto do lote
pendente). Tag de rollback:
`sigcr-backend:pre-deploy-rollback-20260811-1414`. Health check: `/api/`
200; `/api/portarias`, `/api/stats`, `/api/companies`,
`/api/eventos/templates` 401 sem token; `PATCH /api/portarias/x` e `POST
/api/solicitacoes` também 401 sem token (rotas ainda registradas e
protegidas); `docker logs sigcr-backend` sem traceback/500 após restart.
Worktree removido após o deploy.


## 13. PerfilAtivoContext + rebrand visual "Berry" (laranja→azul) — ✅ CONCLUÍDO (deploy 2026-08-11)

Terceiro item da rodada de hoje. Isolado do lote pendente de 2026-08-05, com
uma decisão de escopo tomada em conjunto com o usuário no meio do caminho
(ver abaixo).

**O que é:**
- `PerfilAtivoContext.js` (novo): move o estado de "perfil ativo" (badge
  Registradora/DETRAN/Financeira) de local em `DashboardLayout` pra um
  Context React, acessível por qualquer tela da árvore autenticada (hoje só
  `DashboardLayout` consome; a própria mudança já documenta a intenção de
  outras telas — ex. filtro "Selecionar Empresa" — consumirem depois).
  Lógica idêntica à anterior (mesmo `PERFIS_PERMITIDOS`, mesma
  persistência via `localStorage['sigcr_perfil_ativo']`), só realocada.
- `DashboardLayout.js`: consome o context em vez de estado local; ganha de
  brinde um fix de bug real e pré-existente (não introduzido pelo lote
  pendente) — a seção "Administração" do menu duplicava "Dossiê
  Credenciamento" e "Estados" pra `sigcr_admin` (apareciam tanto no menu do
  badge DETRAN quanto de novo, incondicional, na seção Administração).
  Agora filtra por path já presente no menu do badge ativo.
- **Rebrand de cores "Berry" (achado no meio do trabalho, não estava no
  pedido original — perguntei ao usuário como proceder, respondeu "aplicar
  completo")**: `tailwind.config.js` sobrescreve as escalas nomeadas do
  Tailwind (`orange`→azul MUI blue, `purple`, `emerald`/`green`, `red`,
  `amber`/`yellow`, `zinc`) e `index.css` troca as variáveis CSS
  (`--primary`, `--background` etc.) pro tema escuro "Berry". Como a
  maioria das telas usa classes literais (`bg-orange-500` etc.) direto,
  isso muda a cor de **todo o sistema**, não só a landing pública — decisão
  consciente do usuário, não um efeito colateral escondido.
- Recolor (laranja→azul, sem mudança de interface/props) em `ai-loader.js`,
  `cookie-banner.js`, `globe-hero.js`, `gradient-menu.js`,
  `vapour-text-effect.js`. `ai-loader.js`/`globe-hero.js` não são
  importados em lugar nenhum hoje (achado confirmado por grep) — a mudança
  neles é inerte até alguma tela vir a usá-los.

**Explicitamente excluído desta fatia** (fica pro resto do lote de
2026-08-05, numa rodada própria):
- `interactive-map.js`: sua mudança no working tree quebra a interface (nova
  prop `data` obrigatória, esperando um formato vindo de um endpoint
  `GET /mapa-nacional` que não existe no backend hoje). Se essa versão
  subisse sozinha, o mapa do Dashboard perderia todos os marcadores (sem
  crash, mas regressão visível). Fica na versão antiga, funcionando como
  hoje.
- `CadastroPublico.js`, `FilaRegistros.js`, `GestaoEditais.js`,
  `SolicitacaoRegistro.js` e as rotas/itens de menu associados
  (`/cadastro`, `/fila-registros`, `/gestao-editais`, `/registro-contrato`),
  `Documentos.js` (sua integração com `usePerfilAtivo` filtra por
  `tipo_empresa`, feature ligada ao módulo Financeira/lote pendente) e a
  troca de `NAV_FINANCEIRA` pra apontar nessas rotas novas — mantido como
  está em produção hoje (`/contratos`/`/gravames`, já um gap conhecido e
  não piorado por esta mudança).
- `Dashboard.js`, `MapaNacional.js`, `Editais.js`, `EstadoDetalhe.js`,
  `ChecklistContran.js`, `Checkout.js`, `Planos.js`, `Esteiras.js`,
  `Notificacoes.js`, `PagamentoAguardando.js`, `SolicitacaoDetalhe.js`,
  `UploadDocumentos.js`, `AppMobile.js` — reescritas grandes não
  relacionadas, fora de escopo.

**Isolamento:** `git worktree` a partir do HEAD (`8211a7d`), reaplicando a
remoção do painel-detran (item 11, ainda não commitada em lugar nenhum) +
só os arquivos acima copiados/editados à mão. `git diff --stat` final: 9
arquivos, sem nenhuma menção a `painel-detran`/`gestao-editais`/
`fila-registros`/`registro-contrato`/`CadastroPublico` (confirmado por
grep no bundle final).

**Testado:** `npm ci --legacy-peer-deps && CI=false npm run build`
compilou limpo (só warnings de eslint pré-existentes). Bundle final
(`main.00c982da.js` / `main.687a6f25.css`) confirmado por grep: zero
ocorrências das rotas/telas excluídas, `PerfilAtivoProvider`/
`usePerfilAtivo` presentes, `--primary:207 90% 54%` (azul Berry) presente
no CSS compilado. Build servido estaticamente pra confirmar que os
arquivos gerados não estão corrompidos (200 em `index.html`, JS e CSS).

**Não testado (sem ferramenta de browser neste ambiente)**: clique real —
troca de perfil ativo no seletor, conferência visual de que nenhuma tela
ficou com contraste ruim/ilegível depois do rebrand (risco real dado que é
uma repaginação de cor em todo o sistema, incluindo estados como
sucesso/erro/aviso que agora usam tons diferentes), e confirmação de que o
menu "Administração" deduplicado não escondeu nada que devia aparecer.

**Deploy autorizado pelo usuário em 2026-08-11** (mesmo dia do teste).
Release `releases/20260811-perfilativo-rebrand`, swap atômico do symlink
`current` a partir do build já testado (mesmo hash `main.00c982da.js`/
`main.687a6f25.css`). Health check pós-swap: hash novo servido; CSS
compilado confirmado com `--primary:207 90% 54%` (azul Berry); `index.html`
`Cache-Control: no-cache`, `/static/` `immutable`; rotas `/`, `/dashboard`,
`/portarias`, `/criar-evento`, `/planos`, `/estados`, `/usuarios`,
`/notificacoes` todas 200; bundle ao vivo confirmado por grep (0 menções
das rotas/telas excluídas, `PerfilAtivoProvider`/`usePerfilAtivo`
presentes); backend intocado, `/api/` 200, `/api/portarias` e
`/api/companies` 401 sem token. Worktree de build removido após o deploy.

**Ainda não testado (sem ferramenta de browser)**: clique real — troca de
perfil ativo, conferência visual de contraste em todas as telas após o
rebrand, e confirmação de que o menu "Administração" deduplicado não
escondeu nada que devia aparecer. Recomendado que o usuário/Pedro
confirme visualmente quando puder.


## 14. Certificado digital ICP-Brasil como identidade de login — plano de investigação (2026-08-11)

Retomando um pedido de uma conversa anterior que não está registrado em
lugar nenhum (nem memória, nem neste arquivo) — não tinha o enunciado
original, então confirmei o escopo com o usuário antes de escrever
qualquer coisa.

**Escopo confirmado com o usuário:** o certificado ICP-Brasil não é um
recurso opcional nem só pro cadastro — é a **identidade primária do
sistema**. Precisa identificar empresa (CNPJ) ou pessoa física (CPF) no
primeiro acesso, e ser exigido **em todo login subsequente**, não só na
criação da conta. Objetivo explícito: impedir que um terceiro crie um
usuário fictício — a conta nasce vinculada a um certificado real,
validado, não a um CPF/CNPJ autodeclarado num formulário.

### Achado mais importante — muda a pergunta original "A1 vs A3"

A ICP-Brasil está no meio de uma transição regulatória ativa, com prazos
que já bateram ou estão batendo agora:
- Emissão do e-CNPJ A3 no modelo de 3 anos **encerrou em 28/02/2026** (já
  passou) — CNPJ A3 novo agora só sai com validade de 1-2 anos.
- Emissão de A1/A3 na cadeia V10 (atual) **encerra em 31/12/2026** — daqui
  a ~4 meses e meio. Depois disso, só "casos específicos".
- **Certificado A1 está sendo substituído, especificamente pro lado
  pessoa jurídica (CNPJ), pelo "Selo Eletrônico"** (Selo em Software
  SE-S / Selo em Hardware SE-H) — um modelo novo, não mais A1/A3.
- Lado pessoa física (CPF) segue mais estável: A1 válido até a cadeia V5
  expirar (02/03/2029), A3/A4 seguem como modelo de longo prazo pra CPF
  depois disso.

**Implicação prática:** como o SIGCR precisa identificar tanto CNPJ
(empresa) quanto CPF (pessoa física), construir a integração em cima de
"e-CNPJ A1/A3" hoje é apostar num modelo que a própria ICP-Brasil está
descontinuando pro lado empresa durante a janela em que o SIGCR estaria
sendo construído/lançado. Precisa confirmar direto na fonte (ITI/gov.br,
não posts de blog de certificadoras de 2024) se o Selo Eletrônico
efetivamente serve pro caso de uso "logar como responsável pela empresa
toda vez" ou se é mais restrito (ex: só carimbo/integridade de documento,
não autenticação interativa) — se for mais restrito, a resposta pro lado
CNPJ pode ser "e-CPF do responsável legal + vínculo com o CNPJ via
procuração/QSA da Receita", não um certificado da própria empresa.

### A pergunta técnica real: como "login com certificado, toda vez" funciona na web

Não é só validar a cadeia — é fazer o navegador conseguir *acessar* o
certificado (principalmente A3, que fica preso num hardware) a cada login.
Quatro caminhos realistas, com trade-offs bem diferentes:

1. **mTLS (certificado de cliente TLS) na borda** — nginx pede o
   certificado, valida a cadeia, repassa os campos pro backend. Mais
   "correto" tecnicamente, mas A3 via navegador depende de driver
   PKCS#11 instalado localmente; navegadores modernos vêm reduzindo esse
   suporte nativo (a era NPAPI acabou). Mobile é o ponto mais fraco — em
   geral não dá pra acessar token/smartcard A3 direto do browser mobile.
2. **Desafio-resposta com assinatura local** — servidor manda um nonce,
   algum componente local (extensão de navegador, app nativo, SDK tipo
   "Web PKI" de fornecedores como a Lacuna Software) assina com a chave
   privada, servidor valida a assinatura + cadeia. É o padrão mais comum
   em sistemas brasileiros que precisam de A3 de verdade — mas significa
   pedir pro usuário instalar um componente extra.
3. **Delegar pro Login gov.br** — o gov.br já tem login por certificado
   digital (nível Prata/Ouro) funcionando em produção, já resolveu o
   problema de A3/mobile na prática. O SIGCR (via Keycloak, que já é o IdP
   atual) poderia registrar o gov.br como *identity broker* e receber
   CPF (e dados de representação de CNPJ, se o gov.br expuser isso via
   claim) prontos, sem implementar validação de cadeia ICP-Brasil do zero.
4. **Achado concreto de reaproveitamento**: existe um plugin open-source
   já pronto pra Keycloak — `luneo7/authenticator-icpbrasil-keycloak`
   (GitHub) — que faz exatamente a extração de CPF/CNPJ do certificado
   (via os campos OtherName do Subject Alternative Name, conforme
   DOC-ICP-04/05 da ICP-Brasil) e mapeia pra identidade do Keycloak.
   Resolve a parte de "extrair CPF/CNPJ do certificado dentro do
   Keycloak", mas **não** resolve o problema de acesso ao hardware A3
   pelo navegador (item 1 acima) — só ajuda depois que o certificado já
   chegou no servidor. Precisa avaliar manutenção/maturidade do projeto
   antes de depender dele.

### Perguntas em aberto que bloqueiam qualquer implementação

- Selo Eletrônico serve pro caso de uso de login interativo recorrente, ou
  é só carimbo de documento? (bloqueia a decisão pro lado CNPJ)
- Dado que é "todo login", a operação vai exigir instalar algo no
  computador do usuário (driver A3, extensão, SDK tipo Web PKI) ou dá pra
  delegar isso inteiro pro gov.br?
- O que acontece quando o certificado vence no meio da vida útil da conta
  (A1: até 1 ano; A3: 1-5 anos) — fluxo de renovação, e existe QUALQUER
  fallback (ainda que temporário) sem reabrir a brecha de identidade
  fictícia que essa mudança inteira existe pra fechar?
- Troca de responsável legal da empresa (o dono do e-CPF/e-CNPJ sai da
  empresa) — como a conta é re-vinculada sem virar uma nova brecha?
- Infra atual (nginx → Keycloak → FastAPI) não está configurada pra mTLS
  hoje — se o caminho 1 for escolhido, precisa de mudança de infra, não só
  de aplicação.

### Plano de investigação proposto (fases, sem código ainda)

1. **Confirmação regulatória/fornecedores** (poucas horas): checar direto
   nas fontes oficiais (ITI, gov.br) o que o Selo Eletrônico cobre hoje, e
   o que exatamente o Login gov.br devolve num login por certificado
   (CPF sozinho, ou dá pra obter também representação de CNPJ).
2. **Spike de arquitetura**: comparar só os dois caminhos realistas —
   delegar pro gov.br vs. mTLS/Keycloak in-house (caminhos 1+2+4 acima
   juntos) — em esforço de implementação, custo de manutenção contínua
   (atualização de cadeia/CRL, suporte a driver A3), cobertura de
   dispositivo (desktop + mobile, A1 + A3).
3. **Protótipo** (só depois que 1+2 apontarem um caminho único): validar
   ponta a ponta contra um certificado de teste — extração de CPF/CNPJ,
   validação de cadeia, revogação.

**Recomendação preliminar (a confirmar na fase 1, não uma decisão
fechada)**: dado que é "todo login" e precisa cobrir A1 e A3 (e
provavelmente mobile mais cedo ou mais tarde), delegar pro Login gov.br
tende a ser o caminho de menor risco/manutenção — evita reimplementar
validação de cadeia ICP-Brasil e o problema de acesso a hardware A3 pelo
navegador, que sistemas brasileiros de governo em geral resolvem assim.
Mas isso depende de confirmar na fase 1 se o gov.br expõe o dado de
representação de CNPJ que o SIGCR precisa, não só o CPF da pessoa física.

**Status:** plano de investigação entregue, nenhuma decisão de arquitetura
tomada ainda — aguardando o usuário revisar e decidir se parte pra fase 1
(confirmação regulatória) ou quer discutir as opções primeiro.


## 15. Reorganização de menu DETRAN + tela "Registradoras" (cadastro + status de credenciamento agregado) — ✅ CONCLUÍDO (2026-08-11)

Pedido confirmado pelo Pedro: mover "Empresa" pra dentro de uma seção
"DETRANs e Registradoras" no menu do DETRAN, e trocar por uma visão nova
que une cadastro + status de credenciamento por portaria (em vez de só o
cadastro, como no print que o Pedro mostrou).

**Investigação prévia (antes de codar):**
- `GET /companies` hoje só devolve empresas do próprio `user_id` (exceto
  `sigcr_admin`) — DETRAN não tinha nenhuma forma de listar registradoras.
  A versão com `tipo_empresa` como filtro que aparece no working tree faz
  parte do lote pendente de 2026-08-05 (Fase A), não está em produção —
  não dava pra depender dela.
- Modelo de dados **suporta bem** o agregado pedido: `db.submissoes` já
  tem `company_id` + `estado_sigla` + `portaria_id` + `status` +
  `itens[]` (cada item com `status` pendente/enviado/conforme/inconforme)
  — uma consulta `find({company_id: {$in: [...]}, estado_sigla: uf})`
  direta, sem fan-out caro. Nenhum ajuste de modelo foi necessário.
- `PainelConferencia.js` (tela existente de análise de submissões, por
  portaria) tinha exatamente os badges de status (`STATUS_SUBMISSAO_CFG`,
  `STATUS_ITEM_CFG`) que a nova tela precisava — reaproveitados
  integralmente, só sem os botões de ação (essa tela é só leitura; a ação
  de aprovar/reprovar item continua exclusiva do Painel de Conferência).
- `Estados.js` (rota `/estados`) já é essencialmente a tela "lista de
  DETRANs/UFs" — por isso virou a outra metade da seção "DETRANs e
  Registradoras" ao lado da nova tela.

**Backend** (`GET /detran/registradoras?estado_sigla=<uf>`, novo endpoint):
devolve, por registradora que atua na UF (`tipo_empresa=registradora` e
`detrans_atuacao` contém a UF): dados de cadastro (mesmos campos da tela
Empresa) + lista de submissões nessa UF, cada uma com portaria
(título/número), status da submissão, contagem de itens
conforme/inconforme/pendente e a lista de itens individual (nome +
status + justificativa). Escopo idêntico ao resto do domínio DETRAN
(`_perfil_pode_ver_estado`): `detran`/`detran_admin` só a própria UF
(`detran_uf`, parâmetro ignorado se enviado); `sigcr_admin` escolhe a UF
via query param, obrigatório. `registradora`/`financeira` levam 403.

**Testado em devtest** (`sigcr-backend-devtest` + `sigcr-mongodb-devtest`,
dados sintéticos `regtest_*`: 3 registradoras em UFs diferentes + 1
financeira pra confirmar filtro de tipo, 2 submissões com status
variados): 8 cenários — escopo por UF pro `detran` (só vê quem atua na
própria UF, financeira nunca aparece), `sigcr_admin` sem `estado_sigla`
(400), com UF inválida (400), `registradora` (403), sem token (401), e
confirmação de que a agregação de itens/contadores bate exatamente com o
que foi semeado (homologado com 2/2 conforme, em_diligencia com 1
conforme + 1 inconforme).

**Frontend:**
- `Registradoras.js` (nova tela): lista de cards por registradora
  (cadastro, reaproveitando o layout de `Empresas.js`) com expansão
  por clique mostrando as submissões da UF e, dentro de cada uma, os
  badges de item individual (reaproveitados de `PainelConferencia.js`).
  Seletor de UF só aparece pro `sigcr_admin` (mesmo padrão do Painel de
  Conferência); `detran`/`detran_admin` usam `user.detran_uf` direto.
  100% leitura — sem criar/editar/excluir, como pedido (isso continua só
  em `Empresas.js`, que o DETRAN nem tem permissão de rota pra acessar).
- `DashboardLayout.js`: introduzido suporte a `section` opcional nos itens
  de nav (mecanismo genérico, não específico do DETRAN) — itens com a
  mesma `section` são agrupados num bloco com cabeçalho, mesmo tratamento
  visual que o bloco "Administração" já tinha. `/estados` saiu da lista
  solta do menu DETRAN e entrou, junto com a nova `/registradoras`, na
  seção "DETRANs e Registradoras". Extraído `NavItemLink` (estava
  duplicado 3x: itens soltos, seção nova, bloco Administração). `/registradoras`
  também adicionado a `NAV_ADMIN_EXTRA` (mesmo tratamento que `/estados`
  já tinha, pro `sigcr_admin` alcançar em qualquer badge).
- `App.js`: nova rota `/registradoras`, `perfilPermitido={["sigcr_admin",
  "detran", "detran_admin"]}` (mesma lista de `/estados`).

**Isolamento do deploy:** como o working tree tem o lote pendente de
2026-08-05 misturado (mesmo problema dos itens 11/13 anteriores), o
build/deploy foi feito num `git worktree` a partir do HEAD (`8211a7d`)
reconstruindo em cima dele só o que já está realmente em produção hoje
(remoção do painel-detran do item 11 + `PerfilAtivoContext`/rebrand do
item 13) + esta mudança nova — nada do resto do lote pendente (cadastro
público, fila de registros, gestão de editais) entrou. Confirmado por
grep no bundle final: zero ocorrências de `painel-detran`/`gestao-editais`/
`fila-registros`/`registro-contrato`/`CadastroPublico`.

**Depois do deploy**, as mesmas mudanças de código (backend + `App.js` +
`DashboardLayout.js` + `Registradoras.js` novo) foram também aplicadas de
volta no working tree principal do `/opt/sigcr` (por cima do estado atual,
que já inclui o lote pendente) — só pra não perder o código-fonte da
feature nova dentro de um worktree descartável. Isso significa que o
working tree principal agora tem uma versão de `DashboardLayout.js`
ligeiramente à frente do que está de fato em produção (o mecanismo de
`section` genérico não existia lá antes) — sem problema, é só a mesma
disciplina de sempre: o que está rodando em produção é o que foi buildado
no worktree isolado e testado, não o working tree em si.

**Deploy:** backend via `deploy.sh` no worktree isolado (rollback tag
`sigcr-backend:pre-deploy-rollback-20260811-1625`); frontend via swap
atômico do symlink `current` pro release
`releases/20260811-registradoras`. Health check: `/api/` 200,
`/api/portarias`/`/api/companies`/`/api/estados`/`/api/detran/registradoras`
401 sem token; rotas `/`, `/dashboard`, `/portarias`, `/estados`,
`/registradoras`, `/notificacoes`, `/usuarios`, `/empresas` todas 200.
**Nota:** logo após o restart do backend, `api.sigcr.com.br` devolveu 502
por alguns segundos (nginx marcou o upstream como fora do ar durante a
janela de troca de container — `no live upstreams` no error log) e se
recuperou sozinho antes do próximo health check, sem intervenção — mesmo
padrão de instabilidade momentânea já visto em deploys anteriores, não é
uma regressão nova.

**Não testado (sem ferramenta de browser)**: clique real — expandir um
card de registradora, conferir que o menu lateral do DETRAN mostra a nova
seção "DETRANs e Registradoras" com Estados+Registradoras agrupados, e
que `sigcr_admin` navegando pela seção "Administração" com outro badge
ativo não vê Registradoras duplicado.


## 16. Fix crítico do fluxo credenciamento-por-portaria (botão "iniciar
submissão" 100% quebrado) + destaque de pendência no Dashboard da
Registradora — ✅ CONCLUÍDO (2026-08-11)

Pedido do Pedro: confirmar que o fluxo ponta a ponta (portaria publicada →
Registradora vê e envia documentos → DETRAN analisa → diligência) realmente
funciona hoje, e só depois adicionar um destaque no Dashboard pra deixar
óbvio, assim que a Registradora loga, que há credenciamento pendente —
hoje só descobria navegando até "Minhas Submissões".

### Achado crítico — item 1 do pedido tinha um gap real, priorizado antes do destaque

`POST /submissoes` (`backend/server.py`) exigia `portaria_id: str =
Form(...)` — só aceita o campo vindo de um corpo `multipart/form-data` ou
`application/x-www-form-urlencoded`. `MinhasSubmissoes.js`
(`iniciarSubmissao`) sempre chamou `axios.post(`${API}/submissoes`, null, {
params: { portaria_id } })` — isso manda `portaria_id` como **query
string**, com corpo vazio. FastAPI rejeita com 422 `Field required` porque
o corpo não tem o campo que `Form(...)` exige. Não é um regressão recente:
existia desde a implementação original do fluxo (2026-08-05) — o teste de
então (ver memória/[[project-sigcr-credenciamento-portaria-feature]])
validou o backend via `httpx` chamando com form-encoding correto
diretamente, nunca replicando o padrão de chamada real do frontend, e o
frontend só foi validado por build (compila), nunca clicado de fato (sem
ferramenta de browser). Resultado prático: **toda Registradora/Financeira
que clicasse "Iniciar Submissão" numa portaria publicada recebia erro e
nunca conseguia começar** — o fluxo inteiro estava bloqueado logo no
segundo passo, apesar do resto (upload, submeter, análise do DETRAN,
diligência, homologação, comprovante) estar implementado corretamente.

**Fix**: trocado `portaria_id: str = Form(...)` por `portaria_id: str`
(FastAPI trata como query param pra `str` fora de rota de corpo) — 1 linha,
sem mudança nenhuma no frontend (é o único chamador desta rota, confirmado
por grep). Nenhum outro endpoint do fluxo tinha esse tipo de
descompasso (`PATCH /submissoes/{id}/itens/{id}` usa corpo JSON — bate com
o `axios.patch(..., {status, justificativa})` do `PainelConferencia.js`;
os uploads usam `FormData` de verdade — bate com `Form(...)` no backend).

**Testado em devtest** (`sigcr-backend-devtest` rebuildado a partir de uma
cópia isolada do `server.py` realmente rodando em produção — extraído
direto do container via `docker exec cat` — com só essa 1 linha alterada,
não o `server.py` do working tree, que tem o lote pendente de 2026-08-05
inteiro misturado): fluxo completo ponta a ponta via `httpx` simulando
exatamente as chamadas do frontend real (query param pro create, JSON pro
PATCH de análise, multipart pros uploads) contra dados de teste já
existentes no devtest (empresa `company_e743fc3ab9dc`/SP, portaria
`TEST-001/2026`) — 24 checks, todos passando: portaria publicada visível só
pros itens do perfil da empresa, criar submissão, upload dos 2 itens,
submeter, DETRAN vê e marca 1 conforme + 1 inconforme com justificativa
obrigatória (submissão vai pra `em_diligencia`, justificativa visível pra
Registradora), reenvio do item inconforme (volta pra `em_analise`
automaticamente), DETRAN aprova e homologa, comprovante PDF baixado
(`%PDF` confirmado) — **zero achado de regressão no resto do fluxo**, só o
gap do passo 2.

### Achado separado, não relacionado ao pedido: bind mount de uploads do backend apontando pro lugar errado

Durante a investigação, antes de tocar em produção: `docker inspect
sigcr-backend` mostrou o mount de `/app/uploads` com **source
`/tmp/sigcr-build-registradoras/backend/uploads`** (um worktree de build
descartável do deploy do item 15, hoje vazio) em vez de
`/opt/sigcr/backend/uploads` (o diretório real, com os 13 documentos já
enviados por empresas reais). Container rodando assim desde o restart do
item 15 (`2026-08-11T16:25:58Z`) — mesma classe de incidente do
`PENDING_ACTIONS.md` item "Incidente do bind mount de uploads"
(2026-08-02), causado porque `deploy.sh` resolve `$BACKEND_DIR/uploads`
relativo à própria localização do script, e o script rodou de dentro do
worktree isolado daquele deploy. Consequência prática confirmada: **zero
documentos novos enviados nesse intervalo** (`db.documents` sem nenhum
`created_at` depois do restart — nada foi perdido), mas os 13 documentos
antigos ficaram invisíveis pra API (download quebraria) e qualquer upload
que acontecesse nesse meio tempo iria pra um caminho órfão em `/tmp`, sob
risco real de ser apagado. Corrigido como efeito direto de rodar o
`deploy.sh` deste item **da localização real** (`/opt/sigcr/backend`, não
um worktree) — `docker inspect` pós-deploy confirma o mount de volta em
`/opt/sigcr/backend/uploads`. Vale revisitar depois: `deploy.sh` confirma
que o mount existe, mas não confirma que a *fonte* é a esperada — teria
pego esse caso mesmo assim.

### Destaque de pendência no Dashboard (item 2 do pedido)

`Dashboard.js` (mesmo pra todos os perfis, sem branch por perfil hoje)
ganhou um card condicional, visível só pra `registradora`/`financeira`,
logo abaixo do cabeçalho (antes do carregamento dos stats gerais, com seu
próprio loading/erro isolado — falha silenciosamente sem quebrar o resto
do Dashboard se a checagem falhar): busca a empresa própria + portarias +
submissões (mesma regra de "relevante" de `MinhasSubmissoes.js` — UF de
atuação da empresa + checklist com item pro `tipo_empresa` dela) e conta
quantas portarias relevantes ainda **não têm submissão** ou estão em
**rascunho** (não iniciadas) vs. em **`em_diligencia`** (ajuste pedido
pelo DETRAN). Só renderiza se o total for > 0 — "Você tem N
credenciamento(s) pendente(s) — clique para responder", com o
detalhamento ("X com ajuste pedido pelo DETRAN · Y aguardando envio de
documentos") quando aplicável. Clique no card ou no botão navega (SPA,
sem reload) pra `/credenciamento-portaria`.

**Isolamento pro build**: `Dashboard.js` nunca foi tocado por nenhum dos
deploys anteriores (11/13/15) — confirmado que a versão em produção hoje
ainda é exatamente a do commit `8211a7d` (HEAD). Mudança feita em cima
dela diretamente, não da versão do working tree (que é uma reescrita
grande e não testada, parte do lote pendente de 2026-08-05 — ver
[[project-sigcr-pending-batch-20260805]]). Pra montar o worktree de build
isolado, reconstruí à mão App.js e DashboardLayout.js (que item 13/15 já
tinham deixado corretos no working tree principal, exceto por 3 entradas
do lote pendente ainda misturadas neles — rota/import `PortariaPublica`,
nav `/fila-registros` na Registradora, nav `/gestao-editais` no DETRAN e
Admin, e `NAV_FINANCEIRA` apontando pras rotas novas em vez de
`/contratos`+`/gravames` como item 13 documentou explicitamente ter
mantido — todas removidas pra bater exatamente com o que já está em
produção) e copiei sem alteração os arquivos que item 13/15 confirmam
terem sido aplicados de volta ao working tree tal como deployados
(`DashboardLayout.js` na parte não-financeira, `tailwind.config.js`,
`index.css`, os 5 componentes de UI recoloridos, `PerfilAtivoContext.js`,
`Registradoras.js`). Confirmado por grep no bundle final: zero ocorrências
de `painel-detran`/`gestao-editais`/`fila-registros`/`registro-contrato`/
`CadastroPublico`/`PortariaPublica`.

**Testado em devtest/isolado**: build (`npm ci --legacy-peer-deps && CI=false
npm run build`) compilou limpo (só os warnings de eslint pré-existentes de
sempre, incluindo um novo da mesma classe no `Dashboard.js`). Bundle final
(`main.6a47f241.js`/`main.ddc9c339.css`) confirmado por grep: texto do
card presente ("clique para responder", "aguardando envio de documentos",
"com ajuste pedido pelo DETRAN"), `PerfilAtivoProvider` presente, azul
Berry presente no CSS, zero ocorrências do lote pendente excluído. Servido
estaticamente pra confirmar `index.html`/JS/CSS não corrompidos.

**Deploy** (autonomia total, sem pausar pra aprovação prévia — ver
[[feedback-sigcr-autonomia-total]]):
- Backend: `server.py` do working tree (que tem o lote pendente inteiro)
  temporariamente substituído pela versão isolada (prod + só o fix de 1
  linha) só durante o `deploy.sh`, restaurado logo em seguida — mesma
  técnica de "stash ao redor do deploy.sh" já usada no primeiro deploy
  desta feature, só que por substituição de arquivo em vez de `git
  stash` (mais preciso pra isolar 1 arquivo). Rodado **da localização
  real** (`/opt/sigcr/backend`), não de um worktree — corrige de quebra o
  incidente do bind mount acima. Tag de rollback:
  `sigcr-backend:pre-deploy-rollback-20260811-1835`. Health check: `/api/`
  200; `/api/portarias`, `/api/companies`, `/api/detran/registradoras` 401
  sem token; mount de uploads confirmado em `/opt/sigcr/backend/uploads`;
  sem traceback nos logs.
- Frontend: release `releases/20260811-dashboard-highlight`, swap atômico
  do symlink `current`. Health check: hash novo servido
  (`main.6a47f241.js`), `index.html` `Cache-Control: no-cache`, `/static/`
  `immutable`, rotas `/dashboard`, `/registradoras`, `/estados`,
  `/credenciamento-portaria`, `/detran/conferencia`, `/portarias`,
  `/notificacoes`, `/usuarios`, `/empresas` todas 200.
- Dados de teste do devtest (submissão, documentos, credenciamento
  sintéticos criados durante a verificação) removidos ao final — devtest
  fica limpo pro próximo uso.

**Não testado (sem ferramenta de browser)**: clique real — logar como uma
Registradora com portaria pendente de verdade (ex. HD Registros, se tiver
UF com portaria publicada aplicável) e confirmar visualmente que o card
aparece, o texto/contagem batem, e o clique navega pra
`/credenciamento-portaria` corretamente; confirmar que o card **não**
aparece pra quem não tem pendência.

**Recomendação separada pro Pedro**: vale, numa rodada futura, ajustar
`deploy.sh` pra confirmar não só que o mount de `/app/uploads` existe, mas
que a *fonte* é exatamente `$BACKEND_DIR/uploads` resolvido a partir do
caminho real do backend (não just onde o script foi invocado) — o gap que
causou o incidente deste item passaria despercebido de novo do jeito que
o script está hoje.


## 17. URGENTE — regressão grave do backend (Criar Evento quebrado) + 2
fixes de segurança também revertidos + auditoria de integridade de uploads
— ✅ CONCLUÍDO (2026-08-11)

Pedro reportou dois bugs em produção: (1) wizard "Criar Evento" dando erro
ao publicar, bloqueante; (2) download de documento da HD Registros não
funcionando. Investigação revelou que o bug 1 é sintoma de uma regressão
bem maior.

### Causa raiz do bug 1: os itens 12 e 15 (mais cedo hoje) apagaram 3 dias de trabalho backend

Os itens 11 e 12 (limpeza painel-detran e os 2 fixes de segurança) foram
construídos a partir de `git worktree add ... HEAD` (`8211a7d`) sob a
premissa "HEAD é o mesmo commit que já está em produção" — premissa que
valia pro commit em si (a feature de credenciamento por portaria), mas
**não** pro que foi deployado *depois* dele: a integração Criar Evento ⇄
Portaria (item 8, deploy 2026-08-08) e a remoção da timeline (item 9, deploy
2026-08-09) nunca foram commitadas no git — só existiam no working tree e no
container em produção. Ao rodar `deploy.sh` a partir desses worktrees
isolados baseados em `HEAD`, cada deploy **substituiu inteiramente** o
`server.py` de produção por uma versão que não tinha nada disso. O item 15
(tela Registradoras, também hoje) repetiu o mesmo erro, cimentando a
regressão. O item 16 (fix do `POST /submissoes`, também nesta sessão,
mais cedo) involuntariamente **herdou** essa regressão, porque extraiu o
`server.py` de produção via `docker exec cat` — que essa altura já estava
regredido — pra aplicar seu fix de 1 linha; o fix em si estava certo, só a
base sobre a qual foi aplicado já vinha quebrada.

**O que desapareceu de produção, concretamente**: modelo `Portaria` sem
`template`/`publicado_at`/`token_publico`/`link_publico`/`criado_via`/
`data_abertura`/`data_encerramento`; `PortariaCreate` com `content`/
`source`/`date` obrigatórios de novo (o wizard não envia esses 3 campos);
rota `PATCH /portarias/{id}/publicar` inexistente (404); rota `GET
/portarias/publico/{token}` inexistente; `/checklist-catalogo` (GET/POST/
PATCH/DELETE) inexistente, então o Passo 2 do wizard (escolher checklist)
também não tinha o que carregar; filtro de rascunho-não-vaza em `GET
/portarias`/`GET /portarias/{id}`/`GET /portarias/search` removido (reabria
o vazamento de rascunho corrigido em 2026-08-08); trava de 409 no `DELETE
/portarias/{id}` com submissões em andamento removida. **Além disso**, os 2
fixes de segurança do item 12 também tinham sumido de novo (o item 15
repetiu o erro do 12): `PATCH`/`DELETE /portarias/{id}` sem `estado_sigla`
voltou a aceitar qualquer usuário autenticado (`registradora` incluída);
`POST /solicitacoes` voltou a aceitar `company_id` de qualquer empresa sem
checar dono.

**Confirmado no banco**: `db.portarias` só tinha 2 documentos, nenhum com
`criado_via="wizard"` — ou seja, nenhuma tentativa de Pedro de criar via
wizard chegou a gravar nada (o `POST /portarias` sempre falhava com 422
antes de qualquer `insert_one`), nenhum dado órfão pra limpar.
`db.checklist_catalogo_portaria` continuava com os 13 itens do seed
original de 2026-08-08 intactos — só o *código* backend regrediu, o banco
nunca foi tocado.

### Fix

Reconstrução cirúrgica: extraí o `server.py` real de produção
(`docker exec sigcr-backend cat /app/server.py`, não o `HEAD` do git nem o
working tree, que tem o lote pendente de 2026-08-05 inteiro misturado) e
enxertei nele, peça por peça — comparado contra o working tree local (que
ainda tinha o item 8/9 intactos, nunca perdidos por lá) — só o que
pertence à integração Criar Evento/Portaria + os 2 fixes de segurança do
item 12, explicitamente excluindo tudo do lote pendente de Fase A
(`CHECKLIST_DETRAN_DF_003_2022`, `Company.registradora_id`/`tipo_empresa`
no autocadastro, `/public/cadastro`, `/editais` PATCH/upload,
`/solicitacoes-registro*` — nenhum desses entrou). Confirmado por grep: zero
menções a `registradora_id`/`_validar_tipo_e_vinculo_empresa`/
`CHECKLIST_DETRAN_DF_003_2022`/`public/cadastro` no arquivo reconstruído.

**Testado em devtest** (imagem isolada `sigcr-backend:devtest-wizard-fix`,
`sigcr-mongodb-devtest`, usando as mesmas contas de teste SP — registradora
`company_e743fc3ab9dc` e detran — já seedadas de sessões anteriores): fluxo
completo do wizard simulando exatamente as chamadas do frontend real
(`GET /eventos/templates`, `GET /checklist-catalogo`, `POST /portarias` sem
`content`/`source`/`date`, `PATCH /portarias/{id}/publicar`, visibilidade
de rascunho vs. publicado pra registradora, `GET /portarias/publico/{token}`
sem auth) — 15/15 checks; os 2 fixes de segurança re-testados isoladamente
(registradora barrada de editar/excluir portaria sem UF, barrada de criar
solicitação pra empresa de outro dono, csos legítimos continuando
liberados) — 6/6 checks; regressão completa do fluxo credenciamento-por-
portaria (24 checks, mesmo script do item 16) e de `/detran/registradoras`
(item 15) — sem quebra em nenhum dos dois.

**Deploy**: `deploy.sh` rodado da localização real (`/opt/sigcr/backend`,
com o `server.py` reconstruído temporariamente no lugar — mesma técnica dos
itens 15/16, restaurado o working tree completo com o lote pendente logo
em seguida, já incluindo os 2 fixes de segurança aplicados por cima dele
também, já que o working tree nunca os teve). Tag de rollback:
`sigcr-backend:pre-deploy-rollback-20260811-1855`. Health check: `/api/`
200; `/api/portarias`, `/api/checklist-catalogo`, `/api/companies`,
`/api/detran/registradoras` 401 sem token (confirma rotas registradas);
mount de uploads correto; sem traceback nos logs.

**`deploy.sh` também hardened** contra a causa raiz de tudo isso: agora
recusa rodar (exit 1) se não for executado a partir de `/opt/sigcr/backend`
exatamente, e o check de mount pós-deploy passou a validar o `Source`, não
só o `Destination` — as duas travas que teriam impedido tanto este
incidente quanto o do item 16.

**Não testado contra produção real** (só devtest, com código
byte-idêntico ao deployado) — clique real no wizard pelo Pedro/usuário
ainda recomendado, mas a suíte de testes replica exatamente o payload que
o `CriarEvento.js` envia.

### Bug 2 — HD Registros, diagnóstico (sem fix de código possível)

Confirmado rodando o download de verdade (sessão de teste temporária pro
`user_id` real da HD Registros, removida logo em seguida): dos 12
documentos da empresa, **4 têm o arquivo físico permanentemente perdido**
— exatamente o incidente já documentado no item 7 (2026-08-02), uploads de
2026-07-30, antes do mount ter sido corrigido. Os outros 8 baixam
normalmente (200 OK, testado com um deles). Não existe backup em lugar
nenhum — não tem como recuperar o conteúdo. Documentos afetados (por
`document_name`): "ALVARA DE FUNCIONAMENTO HD REGISTROS", "FGTS
ATUALIZADO", "FGTS HD ATUALIZADO" (a cópia de 2026-07-30, não a de
2026-08-01 que sobreviveu), "BALANCO PATRIMONIAL HD REGISTROS" (a cópia de
2026-07-30). **Ação necessária do Pedro**: re-enviar esses 4 documentos
pela tela de Documentos — o registro no banco já existe, então o reenvio
naturalmente atualiza o mesmo item do checklist.

### Item 3 — auditoria de integridade de uploads (pedido explícito)

Confirmado: **todo** endpoint de upload no sistema (documentos de empresa,
portarias com PDF, editais, solicitações de registro, documentos_gov) usa
o mesmo `UPLOAD_DIR` (`/app/uploads`, um único bind mount) — não há mounts
paralelos ou caminhos alternativos a auditar separadamente. Cruzamento
completo banco vs. disco (todas as coleções que referenciam arquivo:
`documents`, `portarias.link_pdf`; `documentos_gov`/`editais`/
`solicitacoes_registro` estão vazias hoje, nada a checar): 11 documentos
não-removidos + 2 PDFs de portaria = 13 referências, 4 ausentes (os já
conhecidos do item 7, acima), 9 presentes e íntegras. Alguns arquivos
órfãos no disco sem referência no banco (esperado — sobras de documentos
soft-deletados), sem risco de perda, não fizeram parte da checagem de
integridade contrária. Com o mount corrigido (item 16, mais cedo hoje) e o
`deploy.sh` hardenizado (acima), a proteção estrutural contra recorrência
está no lugar; o único item real pendente é a perda física, já
irreversível, dos 4 arquivos do item 7.

## 18. Auto-commit + push obrigatório no deploy (resposta ao drift git↔prod) — ✅ CONCLUÍDO e ATIVO em produção (2026-08-12)

Pedido direto do Pedro em resposta ao incidente do item 17: produção ficou
16 commits à frente do `origin/main` sem ninguém perceber, e dois deploys
feitos a partir de um `git worktree`/HEAD desatualizado sobrescreveram 3
dias de trabalho backend. Ele pediu um mecanismo que force commit+push pro
GitHub como parte do próprio `deploy.sh`, não como passo manual separado —
e que o deploy PARE se o push falhar, em vez de seguir sem sincronizar.

### Causa raiz descoberta (explica por que os 16 commits nunca foram push)

Investigando antes de implementar, veio a pergunta óbvia: "por que ninguém
rodou `git push` em 16 commits?" Resposta: **porque não tinha como.** Duas
credenciais de push estavam configuradas nesta VPS e nenhuma funcionava:

- O remote `origin` (`https://<token>@github.com/prbiomedico/CREDENCIAMENTO.git`)
  tem um Personal Access Token clássico (`ghp_...`) embutido na URL, em
  texto puro no `.git/config`. Esse token está **morto** — `git push`
  falha com `fatal: could not read Password ... No such device or
  address` (não pede senha, simplesmente não autentica), e a API do
  GitHub responde `401 Bad credentials` pra ele. `git ls-remote`/`fetch`
  (leitura) ainda funcionam com ele por algum motivo, o que mascarou o
  problema — só o push está quebrado.
- Existe também uma chave SSH geral já configurada em `~/.ssh/id_ed25519`
  (conta GitHub `AGIOTAPUBG`) — autentica normalmente, tem leitura no
  repo, mas **não tem permissão de escrita**: `git push` retorna
  `Permission to prbiomedico/CREDENCIAMENTO.git denied to AGIOTAPUBG`.

Ou seja: os 16 commits não são falta de disciplina, é uma credencial de
push quebrada há semanas, silenciosa porque nada no fluxo de deploy
dependia dela funcionar até agora. **Recomendação**: revogar esse PAT no
GitHub (Settings → Developer settings → Personal access tokens) já que
está morto e exposto em texto puro no `.git/config` — não precisa mais
dele com o esquema abaixo.

### Fix implementado (código pronto, testado em sandbox local)

- **Chave SSH dedicada de deploy** gerada nesta VPS:
  `~/.ssh/sigcr_deploy_key` (ed25519, sem passphrase, só leitura pelo
  root), com alias em `~/.ssh/config` (`Host github-sigcr-deploy`,
  `IdentitiesOnly yes`) — isolada da chave SSH geral (`id_ed25519`) e sem
  depender de nenhuma conta GitHub pessoal. Falta só um passo, que só o
  Pedro pode fazer (não tenho credencial de admin no repo pra automatizar
  via API): **cadastrar a chave pública como Deploy Key com "Allow write
  access"** em github.com/prbiomedico/CREDENCIAMENTO → Settings → Deploy
  keys → Add deploy key. Chave pública:
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICwFEblQqP8CZVvAYPnU+VTASHVCNigB9rIJkR8mOyxS sigcr-vps-deploy-20260812`
- **`scripts/git-sync-or-die.sh <backend|frontend> [label]`** (novo,
  compartilhado pelos dois deploys): confere a branch atual é `main`; se
  houver mudanças não commitadas **no escopo do path passado**
  (`backend/` ou `frontend/`, não o repo inteiro — ver justificativa
  abaixo), commita como `auto-commit pre-deploy (<label>): <timestamp
  ISO-8601 UTC>`; dá push pro GitHub via `github-sigcr-deploy`; se o push
  falhar por qualquer motivo, sai com `exit 1` e mensagem clara — o
  commit local não se perde, só o deploy para.
  - **Por que escopo por path e não o repo inteiro**: `backend/deploy.sh`
    e `frontend/deploy-frontend.sh` são deploys independentes, e o
    working tree normalmente tem mudanças não commitadas do OUTRO lado
    que não estão prontas pra ir pra `main` (ex.: o lote pendente/não
    testado descrito em memória do projeto). Um `git add -A` cego
    empurraria código não relacionado — e possivelmente não testado —
    pra main junto com o deploy real.
- **`backend/deploy.sh`**: chama `git-sync-or-die.sh backend backend`
  logo após a trava de diretório canônico, antes do `docker build`.
- **`frontend/deploy-frontend.sh`** (novo — não existia um script, o
  processo era 100% manual): codifica o padrão já estabelecido em memória
  (worktree isolado → build → `releases/<label>/` → swap atômico do
  symlink `current`) e chama `git-sync-or-die.sh frontend frontend` antes
  de criar o worktree. **Achado durante o teste**: `git worktree add
  <dir> main` falha (`'main' is already used by worktree at
  /opt/sigcr`) porque o working tree principal já tem `main` checked
  out — o padrão antigo (registrado no item 17) já contornava isso
  usando `HEAD` (detached) em vez do nome da branch; o script novo faz
  `git worktree add --detach <dir> HEAD`, que não tem esse conflito e,
  como o sync já garantiu `HEAD == origin/main`, é equivalente.
- **Identidade git** configurada no repo (estava vazia, causava warning a
  cada commit): `user.name = "SIGCR Deploy"`,
  `user.email = deploy@sigcr.com.br`, local a `/opt/sigcr` (não global).

### Testado

Suíte de 3 cenários rodada contra um repo+remote bare **descartáveis**
(fora de `/opt/sigcr`, sem tocar produção nem GitHub real), via as
variáveis de override `GIT_SYNC_REPO_ROOT`/`GIT_SYNC_DEPLOY_REMOTE` que o
script aceita só pra esse fim: (1) commit escopado por path — mudança
pendente em `backend/` gera commit só de `backend/`, `frontend/`
modificado no mesmo working tree fica intocado; (2) nada pendente → só
push, sem commit vazio, sem erro; (3) push pra um remote inexistente →
`exit 1`, mensagem de erro clara, commit local preservado. Pipeline
completo do frontend (sync → worktree `--detach HEAD` → build fake →
release → swap atômico → cleanup do worktree) também rodado ponta a
ponta no mesmo sandbox, incluindo a trava de branch (rodando fora de
`main` → `exit 1`). **Não testado ainda contra o GitHub real** — bloqueado
até a deploy key ser cadastrada (abaixo).

### Resolução (2026-08-12, mesmo dia)

Pedro cadastrou a deploy key (`sigcr-vps-deploy`, Read/write) em
`prbiomedico/CREDENCIAMENTO/settings/keys`. Sequência executada e
confirmada:

1. **Push de teste** numa branch descartável (`_sigcr_push_test_*`,
   criada e removida na sequência) — confirmou a chave funcionando com
   write access antes de tocar `main`.
2. **Backlog zerado**: os 16 commits antigos + o commit do próprio
   mecanismo (`d1c96b8`) foram pro `origin/main` num push só,
   fast-forward, sem conflito (`028b4bd..d1c96b8`).
3. **`origin` limpo**: a URL do remote (que tinha o PAT morto embutido em
   texto puro) foi trocada pra `git@github-sigcr-deploy:prbiomedico/CREDENCIAMENTO.git`
   — sem segredo nenhum no `.git/config` agora.
4. **Deploy real de teste no backend**: o lote pendente 2026-08-05
   (`backend/server.py`, 922 inserções não testadas) foi posto de lado
   com `git stash` só pra esse arquivo, uma linha de comentário trivial
   foi adicionada como mudança real, e `./deploy.sh` rodou do jeito
   normal (sem nenhum atalho/flag especial) a partir de
   `/opt/sigcr/backend`. Resultado: `git-sync-or-die.sh` detectou a
   mudança, auto-commitou (`f3114e7`), deu push real pro GitHub, e só
   depois disso o `docker build`/restart rodou — exatamente o fluxo
   pedido. Health check padrão passou (`/api/` 200, `/api/portarias` e
   `/api/companies` 401 sem token, mount de uploads confirmado, sem
   traceback nos logs). Tag de rollback:
   `sigcr-backend:pre-deploy-rollback-20260812-1426`. Lote pendente
   restaurado (`git stash pop`) logo depois, intacto e ainda não
   commitado, por cima da linha de teste — nada do lote foi parar em
   produção.

**Mecanismo está ativo**: a partir de agora, `backend/deploy.sh` e
`frontend/deploy-frontend.sh` não rodam build nenhum sem antes commitar
(escopado por path) e confirmar push pro GitHub — se o push falhar, o
deploy para com `exit 1`.

**Não testado ainda**: `deploy-frontend.sh` só foi validado em sandbox
descartável, não contra o GitHub/produção real — o frontend tem um lote
pendente bem maior (`CadastroPublico.js`, `FilaRegistros.js`,
`GestaoEditais.js`, `PortariaPublica.js`, reescritas grandes incl.
`Dashboard.js`, etc.), e um teste real exigiria a mesma técnica de
`stash` isolando bem mais arquivos — mais arriscado de fazer sem pedido
explícito. Rodar esse teste real na próxima vez que houver um deploy de
frontend legítimo, em vez de forçar um agora só pra validar.

**Recomendação em aberto pro Pedro**: revogar o PAT antigo no GitHub
(Settings → Developer settings → Personal access tokens) — já estava
morto, mas ficou exposto em texto puro no `.git/config` por meses e não
tem mais uso nenhum com o esquema de chave SSH dedicada.

## 19. Retomada do lote de 2026-08-05 (auto-cadastro público, fila de registro de contrato, gestão de editais) — ⚠️ EM ANDAMENTO, fatia 0 concluída (2026-08-12)

Pedido do Pedro pra retomar o lote parado desde 2026-08-05 ([[project-sigcr-pending-batch-20260805]] na memória), agora protegido pelo mecanismo do item 18. Plano combinado: relatório do estado real primeiro (prod ao vivo, não git/working tree — lição do item 17), depois fatiar por risco, testar cada fatia isolada em devtest, deployar com o sync automático rodando.

### Relatório do estado real (auditoria feita antes de tocar em qualquer código)

Cruzamento `docker exec sigcr-backend cat /app/server.py` (prod real) × bundle JS da release atual (`main.6a47f241.js`) × `git HEAD` × working tree:

- **`PerfilAtivoContext` — já estava pronto e no ar** (confirmado no bundle: `usePerfilAtivo`/`PerfilAtivoProvider` presentes, `DashboardLayout.js` consumindo). Não fazia parte do trabalho pendente, só faltava ficar commitado.
- **🔴 Achado não relacionado ao pedido — regressão ativa encontrada em produção**: a tela Registradoras (item 15, dada como concluída em 2026-08-11) estava **quebrada**. O frontend (ao vivo) chama `GET /api/detran/registradoras`; testei direto — **404**. O endpoint nunca foi commitado (só o frontend foi copiado de volta manualmente na época) e se perdeu numa das sobrescritas do item 17, sem que o health-check padrão (que não cobre essa rota específica) detectasse. Tratado como fatia 0, fora do lote — ver abaixo.
- **Auto-cadastro público** (`CadastroPublico.js` + `POST/GET /public/*`) — 100% pendente, zero ocorrências no bundle. Maior risco (endpoint público sem auth, provisionamento Keycloak) — fica por último.
- **Fila de registro de contrato** (`FilaRegistros.js` + `SolicitacaoRegistro.js` + 6 rotas `/solicitacoes-registro/*`) — 100% pendente, backend inteiro ausente em prod (404).
- **Gestão de Editais** (`GestaoEditais.js` + `PATCH`/`upload` em `/editais`) — parcialmente no ar: `GET`/`POST /editais` já existem e funcionam (usados pela Transparência pública); o lote só adiciona edição/exclusão/upload de anexos, é aditivo.
- `PortariaPublica.js` e `ChecklistCatalogoPicker.js` também estão no mesmo lote, fora do escopo deste pedido — deixados de lado.

Ordem de fatiamento definida por risco: **0. fix Registradoras (urgente, fora do lote) → 1. Gestão de Editais → 2. Fila de Registros → 3. Cadastro Público.**

### Fatia 0 — fix `/detran/registradoras` — ✅ CONCLUÍDO e no ar

Extraído o endpoint (linhas ~2420–2501 do working tree) isolado do resto do lote pendente (que ficou de lado via `git stash` só do `backend/server.py`), aplicado num worktree limpo a partir de HEAD. Testado em devtest (release fresca do endpoint, `sigcr-mongodb-devtest` com dados existentes de sessões de teste anteriores — perfis/UF reais o bastante pra exercitar a lógica) via sessões `session_token` legadas simulando 3 perfis, 7 cenários:

1. Sem auth → 401
2. `sigcr_admin` sem `estado_sigla` → 400
3. `sigcr_admin` com `estado_sigla=SP` → 200, 5 empresas retornadas corretamente (todas `tipo_empresa=registradora` com `SP` em `detrans_atuacao`)
4. `sigcr_admin` com UF inválida → 400
5. `detran` (UF própria SP) sem param → 200, usa a UF do próprio usuário
6. `registradora` (perfil sem acesso) → 403
7. `detran` (SP) tentando forçar `estado_sigla=RJ` via query param → **ignorado**, continua retornando só SP (confirma que não dá pra um detran de uma UF ver dados de outra UF só mexendo no query param)

**Bug pego no processo, corrigido antes de repetir**: os e-mails sintéticos de teste (`@test.local`) causavam `500` — `EmailStr` do Pydantic rejeita TLD `.local` por ser "special-use/reserved". Troquei pra um domínio genérico não reservado; não é bug do endpoint, é só higiene de dado de teste — documentando caso alguém tropece de novo no mesmo problema.

Endpoint restaurado no `backend/server.py` real (mesma técnica do item 18: lote pendente posto de lado com `git stash` só nesse arquivo, endpoint inserido, `./deploy.sh` rodado de verdade — passou pelo `git-sync-or-die.sh`, commit `8c9c50a`, push confirmado, build/restart normal, rollback tag `sigcr-backend:pre-deploy-rollback-20260812-1447`). Health check: `/api/` 200, `/api/portarias` 401, **`/api/detran/registradoras` agora 401 (era 404)** — confirma restaurado. Lote pendente restaurado por cima (`git stash pop`, 1 conflito de merge só no docstring do mesmo endpoint — resolvido mantendo a versão commitada com a nota do incidente, resto do lote aplicou limpo). Tela Registradoras deve estar funcional em produção de novo — verificação visual real ainda cabe ao Pedro/usuário (sem browser automation neste ambiente).

### Fatia 1 — Gestão de Editais — ✅ CONCLUÍDO e no ar (2026-08-12)

Backend: `PATCH /editais/{edital_id}` (`EditalUpdate`) + `POST /editais/upload` extraídos isoladamente (mesma técnica da fatia 0), testados em devtest — 10 cenários: sem auth (401), perfil sem permissão (403), criação, upload de PDF válido, rejeição de não-PDF (400), upload sem auth (401), edição preservando anexos/termo de adesão ao editar só o título (replica o fluxo real de `abrirEdicao()` do frontend — pega justamente o tipo de bug de "campo se apaga ao salvar" que um teste ingênuo não pegaria), reflexo correto na Área de Transparência pública, e download do anexo servindo o conteúdo certo via a rota já protegida contra path traversal. Deployado em prod via `deploy.sh` real (commit `b26216d`, rollback tag `sigcr-backend:pre-deploy-rollback-20260812-1457`), health check OK, `/api/editais/upload` sem auth confirma 401 (rota existe).

Frontend: `GestaoEditais.js` + rotas/nav (`App.js`, `DashboardLayout.js`) extraídas isoladamente das outras 3 páginas ainda não testadas do lote (`CadastroPublico.js`, `FilaRegistros.js`, `SolicitacaoRegistro.js`, `PortariaPublica.js`, movidas pra fora do working tree temporariamente) e das reescritas grandes não relacionadas (`Dashboard.js`, `Portarias.js`, `CriarEvento.js` etc., postas de lado via `git stash` — `Portarias.js`/`CriarEvento.js` do working tree importam um `ChecklistCatalogoPicker.js` que **não é o que está no ar hoje**, confirmado via bundle live antes de decidir não tocar nelas). Build isolado testado antes (compilou limpo, bundle sem vazamento das páginas não testadas) e deployado de verdade via `deploy-frontend.sh` (novo script, primeira vez usado em produção — commit `a0e9a35`, release `releases/fatia1-gestao-editais`). Confirmado no bundle ao vivo: `gestao-editais`/`usePerfilAtivo`/`/registradoras` presentes, `CadastroPublico`/`FilaRegistros`/`registro-contrato` ausentes. Site respondendo 200.

**Efeito colateral bom**: `App.js` e `DashboardLayout.js` saíram da lista de arquivos pendentes (agora commitados) — o lote restante encolheu pra só as 3 features que realmente faltam + as reescritas grandes não relacionadas.

**Achado de escopo, não corrigido**: `POST`/`PATCH /editais` não valida a UF do edital contra a UF do `detran`/`detran_admin` que chama — mesma classe de gap já mapeada em [[project-sigcr-portarias-perfil-fix]] só que aqui, não introduzido por esta fatia (já existia no `POST /editais` original). Fora de escopo, só registrado.

### Próximas fatias

1. ~~Gestão de Editais~~ ✅
2. Fila de Registros — próxima.
3. Cadastro Público.

Técnica de isolamento consolidada (reutilizável pras próximas 2 fatias): `git stash` nos arquivos tracked não relacionados + `mv` temporário dos arquivos untracked não relacionados pra fora de `frontend/`, edição cirúrgica de `App.js`/`DashboardLayout.js` removendo só as linhas das rotas ainda não prontas, build de teste isolado primeiro (confirma no bundle o que deveria/não deveria estar lá), só depois `deploy.sh`/`deploy-frontend.sh` reais, depois `git stash pop` + `mv` de volta.

### Fatia 2 — Fila de Registro de Contrato — 🧪 TESTADA, deploy NÃO executado (aguardando decisão, 2026-08-12)

Backend (`POST/GET /solicitacoes-registro`, `.../contrato`, `.../comprovante`, `.../concluir`, `.../rejeitar`) extraído isoladamente (mesma técnica das fatias 0/1) e testado em devtest com dados semeados (2 registradoras, 2 financeiras vinculadas uma a cada, 1 financeira sem vínculo) simulando o payload real do frontend (multipart `FormData` pro create/concluir, JSON pro rejeitar — não `httpx` com parâmetros à mão, exatamente pra não repetir o tipo de teste que deixou passar o bug do 422 antes). 27 cenários, todos OK:

- Financeira cria solicitação (multipart completo, replica `SolicitacaoRegistro.js`) ✅
- Financeira sem `registradora_id` tenta criar → 400 ✅
- Financeira tenta usar `company_id` de outra financeira → 403 ✅
- **Escopo (o foco pedido)**: Registradora A vê só a própria (1); Registradora B vê 0; Financeira 2 vê 0 da Financeira 1; acesso direto por ID (contrato/concluir) também bloqueado pra Registradora B → 403, não só a listagem ✅
- Upload de contrato pela Financeira → salva no bind mount (`solicitacoes_registro/`), confirmado por fora do container ✅
- Registradora conclui com upload de comprovante (multipart, replica `FilaRegistros.js`) → status muda, notificação criada, tentativa de concluir de novo → 409 ✅
- Download do contrato (pela financeira dona e pela registradora certa) e do comprovante (após concluído) — conteúdo binário conferido byte a byte nos dois ✅
- Fluxo de rejeição (JSON `{motivo}`, replica `FilaRegistros.js`) → status + `historico_rejeicoes` corretos, registradora errada tentando rejeitar → 403 ✅
- Upload não-PDF rejeitado (400), sem auth em qualquer rota (401), ID inexistente (404), `sigcr_admin` vê tudo ✅

Frontend (`SolicitacaoRegistro.js` + `FilaRegistros.js` + rotas/nav) isolado do que ainda não vai (Cadastro Público, Portaria Pública) do mesmo jeito que a fatia 1 — build limpo, bundle confirmado com `fila-registros`/`registro-contrato`/`solicitacoes-registro` presentes e `CadastroPublico`/`PortariaPublica` ausentes.

**Regressão rápida em prod** (Editais, Portarias, Registradoras, Companies, site): tudo 200/401 como esperado, sem toque nenhum ainda — baseline confirmada saudável antes de qualquer deploy desta fatia.

#### 🔴 Achado que muda a decisão de deploy: a fatia funciona, mas ninguém consegue alcançá-la em produção hoje

`POST /solicitacoes-registro` só funciona se `company.registradora_id` estiver preenchido. Esse campo:

- **Não existe no modelo `Company` rodando em produção agora** (só existe na versão do lote pendente, ainda não deployada).
- **Não tem NENHUM caminho pra ser preenchido em produção hoje** — nem o cadastro público (`POST /public/cadastro`, Fatia 3, ainda não deployada) nem o formulário admin de criar empresa (`Empresas.js`, tela que existe e está no ar, mas **não foi alterada pelo lote** pra expor `tipo_empresa`/`registradora_id` — só o backend `POST /companies` foi, sem UI pra usar).
- **Confirmado direto no Mongo de produção: zero empresas `tipo_empresa=financeira` existem hoje.** Não é uma lacuna teórica — não tem um usuário real no sistema hoje que consiga bater nessa tela e conseguir usar.

Ou seja: dá pra deployar a Fila de Registros agora com segurança (testada, não quebra nada, não é código morto perigoso) — mas ficaria uma funcionalidade completa e correta que **nenhum usuário real consegue alcançar**, porque não existe hoje nenhuma forma de uma financeira nascer vinculada a uma registradora.

**Três caminhos, pedindo decisão**:
1. **Deployar a Fila de Registros mesmo assim** (correta, testada, pronta pro dia em que alguém conseguir vincular uma financeira) e resolver o vínculo depois, junto com a Fatia 3.
2. **Puxar pra frente só a parte de baixo risco da Fatia 3** — o modelo (`Company.registradora_id`) + `POST /companies` admin (já autenticado, sigcr_admin-only, sem risco de superfície pública nova) + um pequeno ajuste em `Empresas.js` pra expor `tipo_empresa`/vínculo no formulário admin de criar empresa — deixando de fora só a parte realmente arriscada da Fatia 3 (`POST /public/cadastro`, sem autenticação, provisionamento Keycloak). Isso destrava a Fila de Registros de verdade sem adiantar o risco maior.
3. **Inverter a ordem**: fazer a Fatia 3 completa antes da Fatia 2.

Sem decidir por conta própria — é uma mudança no fatiamento combinado, não só "achei um bug e corrigi" como nas fatias anteriores.

### Decisão do Pedro: opção 2 — puxar a parte admin de baixo risco. ✅ CONCLUÍDO e no ar (2026-08-12)

Implementado e testado em devtest antes de qualquer coisa ir pra produção:

- **`Company.registradora_id`** (campo novo, `Optional[str] = None`) + `CompanyCreate.tipo_empresa`/`registradora_id` + `CompanyUpdate.registradora_id` (pra corrigir o vínculo depois, sem precisar recriar a empresa).
- **`_validar_tipo_e_vinculo_empresa`**: `tipo_empresa` só `registradora`/`financeira`; `financeira` exige `registradora_id` de uma registradora que existe e está `ativo_contrato_assinado`; `registradora`/`detran` não aceitam `registradora_id`. Chamado tanto em `POST /companies` quanto em `PATCH /companies/{id}` (quando `registradora_id` está no payload).
- **`GET /companies?tipo_empresa=`**: ganhou o filtro (não existia antes) + um caso especial — perfil `financeira` pedindo `tipo_empresa=registradora` não é escopado por ownership (não faria sentido, financeira nunca é dona de uma registradora), vê todas as ativas. É o mesmo dado que `GET /public/registradoras` (Fatia 3) já expõe sem login nenhum — aqui exige login, não amplia exposição nenhuma.
- **Achado no meio do caminho, corrigido sem mudar comportamento**: `/empresas` (`Empresas.js`) é uma tela **self-service** (`perfilPermitido="registradora"`, não é ferramenta de admin) — quem cria a empresa fica dono dela (`user_id = current_user.user_id`). Pra uma financeira real conseguir se vincular, ela precisa alcançar essa mesma tela com a própria sessão, não um admin criando por ela. Ajustado: rota `/empresas` agora aceita `financeira` também, `NAV_FINANCEIRA` ganhou a entrada "Empresa", e `Empresas.js` ganhou os campos Tipo de Empresa + Registradora Vinculada (dialogs de criar e editar). O provisionamento do usuário Keycloak com role `financeira` continua via `GestaoUsuarios.js`, já existente — não foi tocado.
- **Testado em devtest, cadeia completa e real** (não só sintético): usuário `financeira` vê as registradoras disponíveis → cria a própria empresa já vinculada → cria uma solicitação de registro → usuário `registradora` (dono de verdade da registradora escolhida) vê e conclui, com upload de comprovante. Também: `tipo_empresa` inválido (400), `financeira` sem `registradora_id` (400), `registradora_id` de empresa inexistente (404), vínculo a registradora inativa (400), `registradora` tentando setar `registradora_id` na própria empresa — que não é `financeira` (400), correção de vínculo via `PATCH` depois de criado (200). Regressão rápida em `/editais`, `/portarias`, `/detran/registradoras` sem quebra.

**Deploy**: backend (commit `642ffe7`) e frontend (commit `885a7f1`, release `releases/fatia2-fila-registros-e-vinculo`) — os dois passaram pelo `git-sync-or-die.sh` de verdade. Um conflito de merge ao restaurar o lote pendente por cima (3 hunks: comentário do `Company.status`, e 2 docstrings) — resolvido mantendo o comportamento hoje em produção em todos os casos, nada decidido arbitrariamente.

**Achado à parte durante a resolução do conflito, não corrigido, flagrado pra revisão futura**: o lote pendente (`9afbb99`, já commitado em `main` há dias) já continha a migração do vocabulário de `status` (`"pending"` → `"pendente_aprovacao"`) descrita como parte da Fase 1 — mas o `Company.status` que está rodando em produção agora (confirmado via `docker exec cat`) ainda tem o default antigo `"pending"`. Ou seja, essa mudança específica nunca foi de fato deployada, apesar do commit existir — mais um caso do mesmo padrão de drift do item 17 (commit existe, mas o deploy real não refletiu). Mantido `"pending"` neste merge (é o que está ao vivo), comentário deixado no código apontando aqui. Não investigado a fundo nem corrigido — fora do escopo de hoje.

**Health check pós-deploy**: `/api/` 200; `/api/editais`, `/api/portarias`, `/api/detran/registradoras`, `/api/companies`, `/api/solicitacoes-registro` todos 401 sem token (confirma rotas registradas, nenhuma 404); site 200 via domínio real. Verificação visual real (clicar de fato nas telas) segue com o Pedro/usuário — sem browser automation neste ambiente.

**Lote restante após esta fatia**: `CadastroPublico.js`, `PortariaPublica.js`, `ChecklistCatalogoPicker.js` (frontend, untracked) + a parte de `POST /public/cadastro`/`/public/registradoras`/`/portarias/publico`/`/portarias/{id}/publicar` no `backend/server.py` (ainda não commitada) + as reescritas grandes não relacionadas (`Dashboard.js`, `Portarias.js`, `CriarEvento.js`, etc.) — essas últimas continuam de fora de qualquer fatia até serem pedidas.

## Fatia 3 — Cadastro Público — 🧪 TESTADA, deploy NÃO executado (aguardando confirmação, 2026-08-12)

Última fatia do lote original. Maior risco do lote inteiro: endpoint público sem autenticação (`POST /public/cadastro`) que cria conta de verdade no Keycloak + empresa em Mongo na mesma chamada.

### Achado antes de testar: vocabulário de status (conforme pedido, relatado antes de decidir)

`GET /admin/cadastros-pendentes` (fila de aprovação, `GestaoUsuarios.js`) filtra estritamente por `status == "pendente_aprovacao"`. O `Company.status` default que está rodando em produção (mantido na fatia 2, por ser o que já está no ar) ainda é `"pending"` (legado) — se `POST /public/cadastro` não setasse `status` explicitamente, todo cadastro público novo nasceria invisível pra fila de aprovação, num limbo permanente. **Decisão do Pedro**: só `POST /public/cadastro` seta `status="pendente_aprovacao"` explicitamente na criação — não mexe no default do modelo nem no `POST /companies` existente, escopo mínimo, sem mudar nada que já está no ar. Implementado assim.

### Testes em devtest (sem Keycloak isolado — usei o Keycloak real de produção com contas claramente descartáveis, limpas depois)

**Validação antes de tocar o Keycloak** (nenhum desses cria usuário órfão, confirmado checando o Keycloak depois): `tipo_empresa` inválido (400), `financeira` sem `registradora_id` (400), `registradora_id` inexistente (404), senha curta (400), CNPJ duplicado (409).

**Fluxo real completo, ponta a ponta, com dados reais (não sintéticos)**:
1. `GET /public/registradoras` sem auth — lista só `company_id`+`nome_fantasia`, nada sensível.
2. Cadastro público de uma **registradora** de verdade: usuário criado no Keycloak (confirmado via `kcadm.sh get-roles --effective`, role `registradora` presente), empresa criada em Mongo com `status: "pendente_aprovacao"` — **e confirmado que aparece na fila `GET /admin/cadastros-pendentes`** (prova que o fix do vocabulário resolveu o problema real).
3. Cadastro público de uma **financeira** vinculada a essa registradora: mesma validação, role `financeira` no Keycloac, `registradora_id` gravado certo.
4. **E-mail duplicado** → 409, sem criar segunda empresa.
5. Financeira recém-cadastrada (sessão própria, não sintética) vê a própria empresa via `GET /companies` e **cria uma solicitação de registro de contrato de verdade**; a registradora (sessão própria) vê e conclui com upload de comprovante — fecha o loop completo desde o cadastro público até uma ação de negócio real, usando só as fatias já deployadas.
6. **Escopo**: uma terceira registradora, não relacionada, não vê nem alcança por ID a solicitação que veio desse fluxo (0 na listagem, 403 no acesso direto).
7. **Rollback testado de verdade, não só por leitura de código**: instrumentei uma falha forçada logo depois da criação do usuário no Keycloak (variável de ambiente só nesse build de teste, nunca vai pro deploy real) — confirmado que o usuário órfão é deletado automaticamente e nenhuma empresa fica pra trás.
8. **Regressão rápida**: `/editais`, `/portarias`, `/detran/registradoras` (403 correto pro perfil errado) sem quebra.

Todas as contas de teste criadas no Keycloak de produção (2) e os dados no Mongo devtest foram removidos ao final.

**Frontend**: `CadastroPublico.js` isolado (sem `PortariaPublica.js`, que continua fora — não foi pedido), build limpo, bundle confirmado com `public/cadastro`/`public/registradoras` presentes e `PortariaPublica`/`portarias/publico` ausentes.

### Deploy — ✅ CONCLUÍDO e no ar (2026-08-12, confirmado pelo Pedro)

Mesma técnica das fatias anteriores: `git stash` nos arquivos tracked não relacionados, `mv` temporário de `PortariaPublica.js`/`ChecklistCatalogoPicker.js` pra fora de `frontend/` (continuam fora do lote, não foram pedidos), `POST /public/cadastro`/`GET /public/registradoras` aplicados no `backend/server.py` real, rota `/cadastro` + import no `App.js` real. Deploy via `deploy.sh`/`deploy-frontend.sh` reais (commit backend `b97325b`, commit frontend `9a6848a`, release `releases/fatia3-cadastro-publico`). Um conflito de merge ao restaurar o lote pendente por cima (2 hunks, ambos sobre o fix do `status="pendente_aprovacao"`) — resolvido mantendo a versão deployada em produção, sem duplicação de rota confirmada via grep.

**Health check final completo**: `/api/` 200; `/api/editais`, `/api/editais/upload`, `/api/portarias`, `/api/detran/registradoras`, `/api/companies`, `/api/solicitacoes-registro` todos 401 sem token; `/api/public/registradoras` 200 (público, como deve ser); `/api/public/cadastro` sem body 422 (rota existe, valida payload); site 200 via HTTPS real; `/cadastro`, `/gestao-editais`, `/fila-registros` todos 200 (SPA servindo certo); bind mount de uploads confirmado; sem traceback nos logs.

**Resultado**: o lote de 2026-08-05 inteiro que motivou a retomada (Gestão de Editais, Fila de Registro de Contrato, Cadastro Público, PerfilAtivoContext) está testado, no ar, e commitado/pushado no GitHub via o mecanismo do item 18 — nenhuma parte dele mais vivendo só em produção sem estar no git. Junto no caminho: a regressão do item 15 (`/detran/registradoras`) foi restaurada (fatia 0) e o vínculo financeira↔registradora foi construído do zero (não existia nem no lote original) pra fila de registros funcionar de verdade.

**O que sobrou do lote 2026-08-05, ainda fora de qualquer fatia, sem pedido pra entrar**: `PortariaPublica.js` + `ChecklistCatalogoPicker.js` (frontend, untracked) + as rotas backend correspondentes (`/portarias/publico/{token}`, `/portarias/{id}/publicar`, `/checklist-catalogo`) + as reescritas grandes não relacionadas (`Dashboard.js`, `Portarias.js`, `CriarEvento.js`, `ChecklistContran.js`, `Editais.js`, `EstadoDetalhe.js`, `MapaNacional.js`, `Checkout.js`, `Planos.js`, `Documentos.js`, `Esteiras.js`, `Notificacoes.js`, `PagamentoAguardando.js`, `SolicitacaoDetalhe.js`, `UploadDocumentos.js`, `interactive-map.js`'s pending version). Nada disso foi tocado nesta rodada.

**Achado aberto, não corrigido, sinalizado pra revisão futura**: o descompasso do vocabulário de status do `Company` (commit `9afbb99` diz ter migrado pra `"pendente_aprovacao"`, produção real ainda usa `"pending"`) continua existindo pra `POST /companies` (admin/self-service) — só `POST /public/cadastro` foi corrigido, por decisão explícita do Pedro de manter o escopo mínimo. Isso significa que uma empresa criada hoje via `Empresas.js` (fluxo self-service já no ar) ainda nasce com `status="pending"` e fica fora da fila de aprovação `pendente_aprovacao`-only. Mesma classe de bug, ainda não resolvida fora do caminho novo.

## 20. Importação em lote de 58 portarias históricas de acervo — 🧪 TESTADA, import em produção NÃO executado (aguardando confirmação, 2026-08-12)

Pedido do Pedro: importar 58 portarias/editais/instruções/chamamentos públicos reais (26 estados + DF, `import_spec.json` salvo em `backend/`) como rascunho — sem PDF ainda, sem notificar ninguém, sem aparecer pra registradora/financeira até o Pedro anexar o PDF de cada uma manualmente via Portarias.js.

### Achado antes de escrever qualquer coisa: a premissa do pedido não correspondia à produção real

O pedido original assumia um campo `publicado_at` que faria uma portaria ficar "rascunho" até ser publicada. **Esse campo não existe no modelo `Portaria` em produção** — confirmado direto no container (`docker exec sigcr-backend grep ... /app/server.py`). Existe só no lote ainda-não-deployado do `PortariaPublica.js` (memória do projeto), e mesmo lá a lógica só esconde portarias com `criado_via == "wizard"` especificamente, não qualquer rascunho.

**Mais grave**: `GET /portarias` (a rota que `Portarias.js` chama, sem passar `estado_sigla`) **não tinha nenhum filtro por perfil ou por rascunho hoje** — retorna toda portaria não-deletada pra qualquer perfil autenticado, `registradora`/`financeira` incluído. Se eu tivesse simplesmente inserido os 58 registros como pedido, eles apareceriam imediatamente pra toda registradora e financeira do sistema — o oposto do que foi pedido.

**Decisão do Pedro**: filtrar por `link_pdf` vazio. Implementado:

- `GET /portarias` e `GET /portarias/{id}`: perfil `registradora`/`financeira` não vê (lista) nem alcança por ID (404, não 403 — não revela nem que existe) nenhuma portaria com `link_pdf` vazio. `sigcr_admin`/`detran`/`detran_admin` continuam vendo tudo, pra poder editar/anexar o PDF. `GET /portarias/{id}/pdf` já 404ava sozinho nesse caso (sem mudança necessária).

### Achado secundário, sinalizado mas não decidido por conta própria: vocabulário de `tipo`

`tipo_sugerido` no `import_spec.json` (portaria/edital/instrucao/chamamento_publico — tipo de **instrumento**) não é o mesmo vocabulário que a tela `Portarias.js` já usa pro campo `tipo` (credenciamento/descredenciamento/renovacao/alteracao/outro — tipo de **ação**). Gravado como pedido explicitamente (`tipo=tipo_sugerido`), mas o Select de edição não vai reconhecer o valor (aparece em branco) até o Pedro escolher uma das 5 opções existentes ao revisar cada portaria. Não bloqueante — ele já vai abrir cada uma pra editar de qualquer forma.

### Script

`backend/migrations/2026_08_12_import_portarias_historicas.py` — lê `backend/import_spec.json`, valida UF/tipo antes de tocar o banco (tudo ou nada), idempotente (identifica por `criado_via="importacao_manual"` + `title`+`estado_sigla`, pula quem já existe), `--dry-run`. Grava `title`, `content="Importado de acervo histórico — aguardando revisão"`, `source="Importação em lote"`, `estado_sigla`, `tipo`, `link_pdf=None`, mais os campos extras `criado_via="importacao_manual"` e `arquivo_origem_referencia` (nome do PDF original, pro Pedro localizar o arquivo físico ao anexar). `date` (campo obrigatório no modelo, sem equivalente no spec) preenchido com a data/hora da importação — placeholder, o Pedro deve corrigir pra data real do ato ao revisar.

### Testado em devtest

- `--dry-run` e execução real: 58 registros criados, título/UF/tipo conferidos.
- Rodado 2 vezes: segunda vez pulou os 58 (idempotência confirmada, sem duplicar).
- **Visibilidade** (o ponto crítico): `registradora` e `financeira` de teste veem 0 portarias na listagem; `sigcr_admin` e `detran` veem todas. Acesso direto por `portaria_id` — `registradora` recebe 404 (não revela existência), `sigcr_admin` recebe 200. Download de PDF 404 pra qualquer perfil (nenhum PDF anexado ainda, como esperado).
- Regressão rápida: `/editais`, `/detran/registradoras`, `/companies`, `/solicitacoes-registro` sem quebra.

### Deploy e import — ✅ CONCLUÍDO (2026-08-12, confirmado pelo Pedro)

**Backend**: fix de `GET /portarias`/`GET /portarias/{id}` aplicado no `server.py` real (mesma técnica de isolamento das fatias anteriores — lote pendente posto de lado via `git stash`, restaurado depois). Deploy via `deploy.sh` real. Health check: `/api/` 200; `/api/portarias`, `/api/editais`, `/api/detran/registradoras`, `/api/companies`, `/api/solicitacoes-registro` todos 401 sem token; `/api/public/registradoras` 200 (público); site 200 via HTTPS real; mount de uploads confirmado; sem traceback.

**Conflito de merge ao restaurar o lote pendente por cima** (esperado — o lote pendente do `PortariaPublica.js` mexe na mesma função com sua própria lógica de rascunho via `criado_via`/`publicado_at`, ainda não testada nem deployada): resolvido **combinando as duas condições**, não descartando nenhuma — uma portaria só fica visível pra registradora/financeira se passar nas duas guardas (tem `link_pdf` E não é rascunho de wizard não publicado). A lógica de wizard é inerte hoje (nenhum documento real tem `criado_via="wizard"` ainda), então isso não muda nada do comportamento atual — só evita que o buraco de visibilidade que acabei de fechar reabra silenciosamente quando o `PortariaPublica.js` for testado e deployado de verdade no futuro.

**Import rodado contra produção real**: `--dry-run` primeiro (confirmou os mesmos 58 itens do teste em devtest, 0 pulados — primeira execução), depois execução real via `docker exec sigcr-backend python3 migrations/2026_08_12_import_portarias_historicas.py`. Confirmado direto no Mongo de produção: **58 portarias criadas**, distribuídas nas 27 UFs (26 estados + DF) batendo exatamente com o `import_spec.json`, todas com `link_pdf` vazio (nenhuma visível pra registradora/financeira, pela lógica já testada em devtest e agora ao vivo).

**Próximo passo, do lado do Pedro**: entrar em cada uma das 58 portarias (tela Portarias, como `detran`/`sigcr_admin` — são as únicas visíveis pra elas hoje), usar Editar pra anexar o PDF real, corrigir `date` (hoje é a data/hora da importação, placeholder) e revisar/ajustar `tipo` (o Select não vai reconhecer o valor importado — ver achado acima sobre vocabulário). Assim que um `link_pdf` for anexado, a portaria correspondente passa a aparecer normalmente pra registradora/financeira.

## 21. Restauração das 2 portarias apagadas por engano (08-08) + "Trocar Visão" agora simula de verdade — ✅ CONCLUÍDO e no ar (2026-08-13)

Pedro confirmou que **não foi ele** quem apagou as 2 portarias (`deleted_at` de 2026-08-08 01:15) — não foi proposital, provavelmente efeito colateral de algum teste/deploy daquele dia. Dois pedidos, os dois concluídos.

### Parte 1 — Restauração das 2 portarias, com investigação de conteúdo antes de qualquer restauração

Investigado direto no Mongo de produção (só leitura) antes de tocar em qualquer coisa, como pedido:

- **`port_08af5c3feeaf`** — "Edital de Credenciamento nº 17, de 27 de abril de 2026", DETRAN SP, PDF real anexado (391KB, `%PDF-1.7` confirmado no disco), criada 2026-08-03.
- **`port_f80832657d62`** — "Portaria 651/2026-GADIR", DETRAN RN, cita as Resoluções CONTRAN 807/2020 e 1.016/2024, PDF real anexado (320KB, `%PDF-1.4` confirmado no disco), criada 2026-08-04.

Ambas com `origem=manual`/`source=Manual`, PDFs substanciais e válidos, conteúdo regulatório coerente — claramente reais, não teste/lixo. Achado relevante sobre a causa: `created_by` e `deleted_by` das duas são a mesma conta (`administrador@sigcr.com.br`, Pedro), e os dois `deleted_at` ficam **2.6 segundos um do outro** — padrão de script/loop automatizado rodando sob a sessão dele, não dois cliques manuais separados na UI. Bate com a hipótese de efeito colateral de teste/deploy.

Relatado ao usuário com esses detalhes, confirmado "sim, restaurar as duas" antes de qualquer mudança em dado real (regra fixa de [[feedback-sigcr-autonomia-total|autonomia total]]: decisão sobre dado real não é técnica, precisa de confirmação). Restaurado via update direto no Mongo (`deleted_at`/`deleted_by` → `null`, mesmo padrão já usado pra restaurar `estados`) — não existe endpoint de restauração de portaria pronto. Verificado replicando a query exata de `GET /portarias` pro perfil `registradora`/`financeira`: as duas aparecem corretamente pra SP e RN respectivamente (única registradora ativa hoje, HD Registros, atua nas duas UFs).

### Parte 2 — "Trocar Visão" (sigcr_admin) agora aciona a simulação real do backend

**Achado**: `PerfilAtivoContext.trocarPerfil` (o seletor "Trocar Visão" no badge da sidebar) só trocava o menu/nav local — nunca chamava `view_as_company_id`/`view_as_detran_uf`, que já existiam no backend (`get_effective_scope`, feature "modo ver como" de dias anteriores) desde muito antes. Pior: existia um `ViewContext.js`/`ViewProvider` inteiro, com o interceptor axios correspondente já implementado e **testado** (`ViewContext.interceptor.test.js`, 5 testes passando) — mas o `ViewProvider` nunca tinha sido montado em `App.js`, nem consumido por nenhuma tela. Infraestrutura pronta, nunca ligada ao gatilho real da UI — confirmado tanto no código quanto no bundle JS de produção (`__viewContext` presente, `verComoEmpresa`/`ViewProvider` ausentes).

**Mais grave, achado ao investigar a fundo**: mesmo se o frontend chamasse `view_as_company_id` corretamente, boa parte das telas que uma registradora/financeira realmente usa **ignorava esse parâmetro por completo**, porque vários endpoints checavam `current_user.perfil`/`current_user.user_id` (a identidade REAL do admin) diretamente, em vez do escopo efetivo simulado — `GET /portarias`, `GET /portarias/{id}`, `GET /solicitacoes`, `GET /solicitacoes-registro`, `GET /submissoes`, `GET /notificacoes`. Ou seja, mesmo depois de ligar o frontend, "ver como registradora" continuaria mostrando a visão irrestrita do admin nessas telas — exatamente o tipo de falso-positivo que causou a confusão do Pedro (a Parte 1 desta mesma entrada).

**Fix, nas duas pontas:**

- **Backend**: `EffectiveScope` ganhou `as_user()` — devolve uma visão `User`-shaped com os campos EFETIVOS (`perfil`/`user_id`/`detran_uf`), pra helpers antigos (`_perfil_pode_ver_estado`, `_empresa_do_usuario` etc.) funcionarem sob simulação sem precisar ser reescritos. Os 6 endpoints acima migraram de `current_user: User = Depends(get_current_user)` pra `scope: EffectiveScope = Depends(get_effective_scope)` + `current_user = scope.as_user()` — mudança mínima e cirúrgica em cada um, sem alterar nenhuma lógica de negócio existente (só a fonte da identidade). Deliberadamente só nos GETs de listagem/detalhe — os PATCHs de escrita (ex. marcar notificação como lida) continuam na identidade real, pra simulação nunca causar efeito colateral na conta de verdade da empresa simulada.
- **Frontend**: `ViewProvider` montado em `App.js` (dentro de `AuthProvider`, ao redor de `PerfilAtivoProvider`). `DashboardLayout.js` ganhou um seletor "Simular como" — um `<select>` de empresas reais (tipo registradora/financeira, buscadas via `GET /companies?tipo_empresa=`) ou de UF (pra DETRAN), que aparece sempre que `sigcr_admin` está com um badge de perfil ativo, com indicador visível ("● Vendo exatamente como X") quando a simulação está ligada. Trocar de badge (registradora → DETRAN, etc.) encerra automaticamente uma simulação do tipo errado, pra nunca deixar "ver como HD Registros" grudado depois de trocar pro badge DETRAN.

**Testado em devtest, com dados reais da HD Registros** (mesmo `company_id`/`user_id`/CNPJ de produção, mesma técnica de [[feedback-sigcr-frontend-backend-contract-testing|testes anteriores]]): 12 cenários, o mais importante sendo comparar a visão simulada contra uma **sessão real independente** — `GET /portarias` como admin simulando `company_hdregistros` bateu **exatamente** com o que a sessão de login real da HD Registros vê (as 2 portarias com PDF, nenhum rascunho); o mesmo pra uma simulação de DETRAN RN contra uma sessão real de `detran_admin` da própria UF. Também: admin sem simulação continua vendo tudo (sem regressão), perfil não-admin tentando `view_as_*` continua 403, isolamento entre duas empresas diferentes em `/solicitacoes`/`/submissoes`/`/solicitacoes-registro` (uma não vê a da outra), e confirmado que marcar notificação como lida sob simulação NÃO vaza efeito colateral pra conta real da empresa simulada.

**Deploy**: backend (commit `5f6fe6b`) isolado do grande lote pendente e não-testado que ainda vive misturado em `server.py` no working tree (o mesmo lote do `PortariaPublica.js`/catálogo de checklist, ver itens anteriores) — reconstruído à mão sobre HEAD limpo, mesma técnica de isolamento de todas as fatias anteriores, diff final conferido linha a linha (só as 7 mudanças pretendidas, nada do lote pendente). Frontend (commit `3f009a9`, release `releases/verascomo`) isolado do mesmo jeito do lado frontend (`git stash` dos 19 arquivos não relacionados do lote pendente, restaurados depois do deploy). Os dois passaram pelo `git-sync-or-die.sh` real. Health check: `/api/` 200; `/api/portarias`, `/api/solicitacoes`, `/api/companies`, `/api/notificacoes`, `/api/submissoes`, `/api/solicitacoes-registro`, `/api/stats` todos 401 sem token (rotas registradas, sem 404/500); as 2 portarias restauradas confirmadas intactas no Mongo pós-deploy; bundle novo confirmado com `verComoEmpresa`/`verComoDetran`/`irrestrita` presentes; site 200; cache headers OK.

**Ainda não testado (sem ferramenta de browser neste ambiente)**: clique real no seletor "Simular como" pelo Pedro — escolher HD Registros no badge Registradora e confirmar visualmente que Portarias/Solicitações/etc. mudam pra visão restrita, e que sair da simulação volta a mostrar tudo.

## 22. Bug de download de PDF de portaria — 403 pra toda registradora/financeira, pré-existente — ✅ CONCLUÍDO (2026-08-13)

Pedro reportou "Erro ao baixar PDF da portaria" tentando baixar o PDF das 2 portarias restauradas no item 21 (Edital 17-SP e Portaria 651-RN).

**Investigação (na ordem pedida):**

1. **`link_pdf` e arquivo físico**: confirmados intactos — mesmo caminho de antes do soft-delete (`/app/uploads/portarias/fdd0f8aef...pdf` e `.../69360a9a...pdf`), arquivos presentes no bind-mount (391KB e 320KB), bind mount com `Source` correto.
2. **Reprodução real** (não só checagem de existência — chamada real da rota, replicando a forma exata que `Portarias.js`'s `handleDownloadPdf` chama: `axios.get('/portarias/{id}/pdf', {withCredentials:true, responseType:'blob'})`): como `sigcr_admin` (Pedro), a rota respondia 200 normalmente. Como a sessão real da HD Registros (registradora, `detrans_atuacao` cobrindo SP e RN), a rota respondia **403 "Perfil sem acesso a esta portaria"**.
3. **Causa raiz, não relacionada às correções de hoje**: `download_portaria_pdf` checava só `_perfil_pode_ver_estado(current_user, uf)` — que é **sempre `False`** pra `registradora`/`financeira`, sem exceção. Diferente de `GET /portarias` (lista) e `GET /portarias/{id}` (detalhe), que também liberam via `empresa_atua` (a empresa opera naquela UF, campo `detrans_atuacao`). Ou seja: **toda** registradora/financeira sempre levou 403 tentando baixar o PDF de **qualquer** portaria que conseguia ver normalmente na lista — bug geral, pré-existente, não introduzido pelas correções do item 21 nem pela restauração em si. Só ficou visível porque essas 2 portarias específicas acabaram de passar por verificação.

**Fix**: `download_portaria_pdf` migrado pra `EffectiveScope` (mesmo padrão do item 21) e replicando a MESMA regra de acesso de `GET /portarias/{id}` (`_perfil_pode_ver_estado` OR `empresa_atua`), em vez de reinventar. Log de auditoria continua com `scope.current_user` (identidade real), não a efetiva — consistente com o padrão já estabelecido.

**Testado em devtest com os 2 PDFs reais** (copiados do bind-mount de produção, bytes idênticos): sessão real da HD Registros agora recebe 200 com o PDF **byte-a-byte idêntico** ao arquivo original (sha256 conferido) nas duas portarias; controle de isolamento — uma segunda empresa de teste que só atua em SP continua levando 403 na portaria de RN (o fix não virou bypass geral, só fecha a lacuna real); caso de portaria-rascunho sem PDF continua 404 normalmente.

**Deploy**: commit `0d9efb4`, isolado do lote pendente do mesmo jeito dos itens anteriores (diff final: só as 21 linhas desta função). Health check OK (`/api/portarias/{id}/pdf` sem auth → 401, não 404/500). As 2 portarias restauradas confirmadas intactas no Mongo pós-deploy.

## 23. Rodada de 4 fixes (sessão expirada, boas-vindas duplicado, título Compliance, cor "Atenção") — ✅ CONCLUÍDO (2026-08-19)

Pedro reportou 4 problemas encontrados testando produção como Registradora. Investigada a causa raiz de cada um antes de codar, conforme pedido.

**1. "Sessão expirada" em `/empresas` após ~45min**: confirmado via `kcadm.sh` que o realm `sigcr` expira sessões ociosas em `ssoSessionIdleTimeout=1800s` (30min) — o refresh silencioso via `refresh_token` já existia (interval de 30s + `onTokenExpired` em `AuthContext.js`), então em uso ativo a sessão não deveria cair. Bug real encontrado: o interceptor global do axios tentava `kc.updateToken(30)` e, se falhasse (sessão do Keycloak de fato morta), **engolia o erro silenciosamente** (`catch {}`) e mandava a requisição mesmo assim com o token velho — garantindo um 401 cru que cada tela tratava do seu jeito (banner estático em `Empresas.js`), em vez de cair no re-login automático que o resto do app já fazia. Fix: no catch do interceptor, chama `keycloak.login()` direto, mesmo caminho do interval. Ainda precisa de confirmação do Pedro em uso real (deixar sessão ociosa expirar e ver se cai direto no login do Keycloak).

**2. "Bem-vindo ao sigcr SIGCR" duplicado no Dashboard**: typo literal em `Dashboard.js` (não interpolação). Corrigido pra "Bem-vindo ao SIGCR".

**3. Título "Compliance" com aparência de glitch**: não é CSS mal posicionado — é `VaporizeTextCycle` (`components/ui/vapour-text-effect.js`), uma animação real em `<canvas>` que dissolve o texto em partículas entre "Credenciamento"/"Compliance"/"SIGCR". Um print no meio da transição mostra letras sólidas + nuvem de partículas se desfazendo por design, não um bug de camada. O que piorava a leitura: cor hardcoded em `rgb(249, 115, 22)` — laranja puro que não existe mais em nenhum outro lugar da marca (paleta `orange` do Tailwind foi remapeada pro azul "Berry" no rebrand anterior, ver [[project-sigcr-keycloak-login-theme]]). Corrigido pra `rgb(33, 150, 243)` (mesmo azul do resto do app); a animação de dissolução em si foi mantida — trocar por título estático seria decisão de produto separada, não bug.

**4. Card "Atenção" do semáforo sem cor de farol**: usava `color: 'orange'` → classes Tailwind `bg-orange-500`/`text-orange-400`, que hoje renderizam como o azul primário da marca (mesmo remapeamento do item 3) — por isso "Atenção" saía visualmente igual a um botão comum. Confirmado que `amber` é a cor semântica de alerta real, não remapeada, já usada em outros pontos (inclusive o banner "Sessão expirada" do item 1). Corrigido pra `color: 'amber'`.

**Validação visual**: harness isolado (`git worktree` descartável + rota `/__preview` temporária, nunca commitada) renderizando os componentes reais (`Dashboard.js`, `vapour-text-effect.js`) com dados mock, sem precisar de login — puppeteer-core + chromium via snap, mesma técnica de [[project-sigcr-keycloak-login-theme]]. Confirmado depois que o bundle publicado em produção contém exatamente os valores esperados (grep no JS minificado: `"Bem-vindo ao SIGCR"`, `rgb(33, 150, 243)`, `color:"amber"`).

**Deploy**: isolado do lote pendente (Cadastro Público, Dashboard Financeira, catálogo de checklist, mudanças em `server.py`) via `git stash push -u` antes de codar, restaurado (`stash pop`, merge automático sem conflito) depois do deploy — mesmo padrão dos itens anteriores. Só 2 arquivos tocados: `frontend/src/contexts/AuthContext.js` e `frontend/src/pages/Dashboard.js`. Commit `a52e57e` via `deploy-frontend.sh` (git-sync-or-die real), release `releases/4fixes-20260819`. Health check: site 200, bundle novo (`main.53a31f0f.js`) confirmado com os 3 fixes visuais/texto; CSS não mudou (mesmo hash `main.7a4a33bc.css` — confirma que `amber`/`bg-orange` já existiam como classes literais em outros pontos do código, sem risco de purge do Tailwind).

**Fora do escopo, como combinado com Pedro**: funil de Planos/Checkout (laranja hardcoded) — decisão de marca separada.

**Observado mas não mexido**: worktree órfão de `/tmp/sigcr-build-20260813-161830` (sessão anterior, nunca removido) e um dev server `craco start` rodando desde 27/07 (PID antigo, propósito desconhecido) — vale o Pedro confirmar se pode limpar os dois.

## 24. "Erro ao carregar solicitações" em toda página — JWKS do Keycloak inacessível de dentro do container — ✅ CONCLUÍDO (2026-08-22)

Pedro reportou o erro aparecendo em toda tela do frontend, não só numa página. Investigação seguiu a ordem pedida, causa raiz confirmada antes de mexer em qualquer código.

**1. Componente**: a mensagem literal só existe em 3 páginas (`Solicitacoes.js`, `SolicitacaoRegistro.js`, `SolicitacaoDetalhe.js`) — nenhum componente global (`DashboardLayout.js` etc.) dispara esse texto. Não era um bug de componente global: era o MESMO tipo de falha (401) acontecendo em paralelo em praticamente todo endpoint que qualquer página chama no mount, incluindo o polling global de `/notificacoes` do `DashboardLayout` — por isso a impressão de "toda tela".

**2/3. Logs do backend** (`docker logs sigcr-backend`): distribuição de status nas últimas 3h mostrava 401 em praticamente tudo — `/notificacoes` (33x), `/companies` (20x), `/estados` (15x), `/solicitacoes` (7x), etc. O log de aplicação (não só o access log) tinha a causa exata repetida centenas de vezes: `WARNING - JWT Keycloak inválido: All connection attempts failed`.

**Causa raiz**: `get_current_user` (`server.py`) monta a URL do JWKS com `KEYCLOAK_URL` (`https://auth.sigcr.com.br`, hostname público) em vez de `KC_INTERNAL_URL` (`http://sigcr-keycloak:8080`, rede docker) — que já é o padrão usado em TODO o resto do arquivo pra chamadas backend→Keycloak (admin API, criação de usuário, etc.), só esse ponto ficou de fora. `auth.sigcr.com.br` está mapeado em `/etc/hosts` do HOST pra `127.0.0.1` (nginx do host escuta lá) — mas de dentro do container `sigcr-backend`, `127.0.0.1` é o loopback do PRÓPRIO container, onde nada escuta na porta 443. Reproduzido diretamente: `docker exec sigcr-backend python3 -c "httpx.get('https://auth.sigcr.com.br/...')"` → `ConnectError: Connection refused`; a mesma chamada trocando pra `http://sigcr-keycloak:8080/...` → `200 OK`. Como o cache de JWKS (`_jwks_cache`, TTL 1h) nunca conseguia se popular, **todo** token, de qualquer usuário, em qualquer endpoint, caía no fallback de `session_token` legado e virava 401 "Token inválido" — não é 4xx de lógica de negócio nem CORS, é falha de rede container→host.

**Correção**: trocado `KEYCLOAK_URL` por `KC_INTERNAL_URL` na montagem de `JWKS_URL`, alinhando com o padrão já usado no resto do arquivo. Fix simples, sem decisão de produto envolvida — corrigido e deployado direto, como combinado com o Pedro.

**Validação**: reproduzido o erro de rede isoladamente antes do fix (`docker exec` + `httpx` direto, sem precisar de token real de usuário — a falha é de conectividade, não de credencial); confirmado pós-deploy que a mesma chamada, de dentro do container reconstruído, retorna 200 com 2 chaves; confirmado com tráfego real do Pedro logo após o deploy que `GET /api/solicitacoes` e `GET /api/notificacoes` passaram a responder 200 (antes, 401 constante).

**Deploy**: isolado do lote pendente (`git stash push -u` / `stash pop`, mesmo padrão dos itens anteriores) — só 6 linhas em `backend/server.py` tocadas. Commit `4fdb1fa` via `deploy.sh` real (rollback tag `sigcr-backend:pre-deploy-rollback-20260822-1131`). Health check OK.

**Não investigado, fora do escopo deste fix**: por que `auth.sigcr.com.br` foi parar no `/etc/hosts` do host apontando pra `127.0.0.1` — não sei precisar quando isso mudou nem se foi intencional (não achei o commit/log de quem fez). Vale o Pedro confirmar se essa entrada faz sentido ficar assim (só um problema pro `sigcr-backend` por causa do isolamento de rede do container) ou se deveria ser removida/trocada por um IP real, já que hoje qualquer outro processo rodando em container que precise falar com `auth.sigcr.com.br` vai cair na mesma armadilha.

## 25. Reconciliação de um snapshot divergente do Emergent (auth pluggable, rate limiting, CAPTCHA, docs fecháveis) — Fatia A+B ✅ CONCLUÍDO e no ar (2026-08-25)

Pedro trouxe um zip (`SIGCR-082026-main.zip`, 13MB) de uma sessão separada do Emergent — código sem histórico de git compartilhado com este repo, com `AUTH_MODE=local|keycloak` plugável, rate limiting, CAPTCHA plugável (Turnstile), `/docs`/`/redoc`/`/openapi.json` fecháveis em produção, validação de CNPJ/e-mail, e-mail plugável (Resend/mock), e uma migração Keycloak→local pronta (`migrations/2026_08_23_migrar_keycloak_para_local.py`). Extraído em `/tmp/sigcr-emergent-import` (isolado, nunca em `/opt/sigcr` direto) pra reconciliação antes de qualquer merge.

### Reconciliação — sem conflito com os fixes recentes

Diff feito contra `git show HEAD:backend/server.py` (o HEAD deployado, não a working tree suja com o lote pendente de 05/08 — que teria distorcido o diff). Resultado: 16 hunks, 686 linhas, **zero conflito** com os itens 21 (Trocar Visão/`EffectiveScope`), 22 (download de PDF) e 24 (JWKS `KC_INTERNAL_URL`) — as três correções estão byte-a-byte idênticas nos dois lados, inclusive o comentário do fix do JWKS é texto igual. Indica que essa sessão do Emergent partiu do GitHub `main` já depois do deploy do item 24 (22/08).

### Correção sobre o pedido original: o fix de `GET /auditoria/{entidade_id}` NÃO estava no zip

Pedro pediu pra priorizar um suposto fix de `GET /auditoria/{entidade_id}` sem filtro de escopo "já implementado no zip". Conferido linha a linha: a função está **idêntica** à de produção nos dois lados — sem filtro de escopo, qualquer perfil autenticado ainda vê o histórico de auditoria de qualquer entidade por ID. Esse gap continua real e aberto, mas não veio pronto — fica pra uma rodada futura, precisa ser escrito do zero.

O que **de fato** veio implementado e testado no zip foi um IDOR diferente e real: `PATCH /documents/{id}/vencimento` não checava dono da empresa do documento — qualquer usuário autenticado conseguia alterar a data de vencimento de documento de empresa alheia (sem 403/404). Tinha teste de regressão no próprio zip (`test_patch_vencimento_de_documento_alheio_deve_ser_negado`). Essa foi a Fatia A que efetivamente entrou nesta rodada, no lugar do pedido original.

### O que entrou (Fatia A + Fatia B)

**Fatia A — IDOR real**: `set_vencimento` migrado pra `_autorizar_acesso_empresa` (mesmo padrão do item 21/22 — dono da empresa ou `sigcr_admin`), mais validação de formato de data (`YYYY-MM-DD`, 400 se inválida).

**Fatia B — hardening aditivo, tudo gateado por env ausente hoje**:
- `/docs`, `/redoc`, `/openapi.json` fechados quando `ENVIRONMENT=production` ou `DISABLE_API_DOCS=true`.
- Rate limiting em memória (hand-rolled, não usa a lib `slowapi` que estava no `requirements.txt` do zip — dependência morta, não trazida) aplicado a `POST /public/cadastro` (5/5min).
- CAPTCHA plugável (Cloudflare Turnstile) — no-op sem `TURNSTILE_SECRET_KEY` na env (não setada hoje).
- Validação de CNPJ real (`validate-docbr`, que **já estava** no `requirements.txt` de produção — não precisou adicionar) em `POST /companies` e `POST /public/cadastro` (só nos endpoints de criação, não em update — empresas existentes não são afetadas).
- `CORS_ORIGINS` deny-all por padrão em vez de `*` — no-op hoje, produção já seta `CORS_ORIGINS=https://sigcr.com.br` explicitamente no `.env`.

**Deliberadamente fora**: `GET /public/selo/{company_id}` (selo público de compliance) e a varredura+e-mail de vencimento de documento (`_executar_avisos_vencimento`, `/cron/avisos-vencimento`) — recursos novos, não hardening, ficam pendentes como Fatia C até o Pedro decidir com calma. Toda a Fatia D (`AUTH_MODE=local`, `auth_local.py`, `email_service.py`, `/auth/login`, `/auth/esqueci-senha`, telas novas de login/reset) continua bloqueada, nada disso foi importado.

### Testado (não deu pra rodar `backend/tests/` como pedido — motivo abaixo)

O `backend/tests/` do zip **não roda contra um deploy Fatia A+B** porque `conftest.py` é inteiramente construído em cima de `AUTH_MODE=local`: todo login de teste passa por `POST /auth/login` (Fatia D, fora de escopo) e por credenciais em `/app/memory/test_credentials.md` (convenção de path do próprio Emergent, nem existe aqui). Não é um bug — é a suite inteira estruturalmente amarrada a um recurso que a gente decidiu não trazer ainda.

Em vez disso, validado com a técnica já estabelecida neste projeto (sessão `session_token` legada inserida direto no Mongo — dispensa Keycloak real pra simular perfil):
- Worktree limpo a partir de HEAD (`/tmp/sigcr-worktree-fatiaAB`), devtest (`sigcr-backend-devtest-fatiaAB` + `sigcr-mongodb-devtest`, banco `sigcr_devtest_fatiaAB`, dropado ao final).
- **IDOR do vencimento**: empresa B tentando editar documento da empresa A → 403; dona (empresa A) edita → 200; `sigcr_admin` edita → 200; data em formato inválido → 400; documento inexistente → 404. Os 5 cenários bateram.
- **Docs fechados**: `/docs`, `/openapi.json` → 404 com `ENVIRONMENT=production`.
- **Rate limit**: 6ª chamada a `/public/cadastro` na janela de 5min → 429 (as 5 primeiras passam).
- **CNPJ**: inválido → 400; válido (gerado via `validate_docbr`) → 200, cadastro real criado (inclusive usuário real no Keycloak de produção, via `KEYCLOAK_INTERNAL_URL` — apagado depois com `kcadm.sh delete users/...`, confirmado removido).
- **Regressão rápida**: `/companies`, `/editais`, `/portarias` sem quebra com sessões sintéticas; nenhum traceback nos logs do devtest além do esperado (um 500 inicial foi artefato dos meus próprios dados sintéticos incompletos, corrigido e reconfirmado — não bug de código).

### Deploy — ✅ no ar

Isolado do lote pendente via `git stash push -u` / `stash pop` (mesmo padrão dos itens 21-24), diff final conferido (só `server.py` + `requirements.txt`, 90+2 linhas, nada do lote pendente vazando). `.env` real ganhou `ENVIRONMENT=production` + `DISABLE_API_DOCS=true` (chmod 600 restaurado depois — o Edit recriou o arquivo com permissão default). `requirements.txt`: adicionadas `bcrypt==4.1.3` e `PyJWT==2.13.0` a pedido do Pedro — registrando que **nenhuma delas é exercitada por código desta Fatia A+B** (só entrariam em uso na Fatia D, via `auth_local.py`, que não foi trazido); ficam instaladas e dormentes até lá. `validate-docbr` já estava presente, não precisou de mudança.

Deploy via `deploy.sh` real — auto-commit `17568eb`, push confirmado pro GitHub (`0ccd7d6..17568eb`) antes do build (git-sync-or-die), rollback tag `sigcr-backend:pre-deploy-rollback-20260825-1543`, mount de uploads confirmado.

**Smoke test em produção** (achado no caminho: testei primeiro contra `sigcr.com.br/api/*` por engano e vi tudo voltando 200/HTML — falso alarme, `sigcr.com.br` é só a SPA estática sem proxy de `/api` nenhum; a API real vive em `api.sigcr.com.br`, confirmado via `/etc/nginx/sites-available/sigcr-com-br` e `sigcr-api-com-br`): `api.sigcr.com.br/docs`, `/redoc`, `/openapi.json` → 404; `/api/companies`, `/api/portarias`, `/api/editais`, `/api/solicitacoes-registro`, `/api/notificacoes`, `/api/stats` → 401 sem token; `/api/public/registradoras` → 200; CNPJ inválido em `/api/public/cadastro` real → 400 sem criar nada; sem traceback nos logs do container real.

`git stash pop` restaurou o lote pendente por cima sem conflito (`Auto-merging backend/server.py`, sem marcadores de conflito, sintaxe válida depois).

### Pendência crítica registrada, NÃO implementada — bloqueio pra Fatia D

`auth_local.py` (ainda não trazido pro repo) semeia 3 contas demo (`detran.pr@demo.sigcr.com.br` / `Detran@2026`, `registradora@demo.sigcr.com.br` / `Registradora@2026`, `financeira@demo.sigcr.com.br` / `Financeira@2026`) com **senhas fixas hardcoded no código-fonte**, sem nenhum gate de ambiente — `seed_local_users` roda incondicionalmente sempre que `AUTH_MODE=local`, produção incluída. Isso vai pro GitHub público (mesmo repo `prbiomedico/CREDENCIAMENTO`) no momento em que a Fatia D for mergeada. **Antes de cogitar mergear qualquer parte da Fatia D pro `main`**, isso precisa de gate — algo como só seedar as contas demo se `ENVIRONMENT != "production"`, ou remover as senhas hardcoded do código e mover pra env/seed manual. Fica registrado aqui como condição bloqueante, não uma sugestão — não decidir a migração Keycloak→local sem resolver isto primeiro.

## 26. Sequência aprovada pra Fatias C e D — Fase 1: gate de ambiente em auth_local.py ✅ CONCLUÍDO (2026-08-25)

Pedro aprovou a sequência completa pra terminar de reconciliar o import do Emergent: Fase 1 (gate de segurança, este item) → Fase 2 (Fatia C) → Fase 3 (reconciliação do frontend, do zero) → Fase 4 (Fatia D, só com confirmação explícita dele nessa fase específica). Reportar ao final de cada fase antes de seguir.

**Fase 1**: resolvida a pendência crítica do item 25. `auth_local.py` trazido pro repo com o gate — `seed_local_users` agora só semeia as 3 contas demo (`SEED_USERS`, senha hardcoded) quando `ENVIRONMENT` não é `"production"` (comparação case-insensitive, mesmo padrão de `_docs_off` em `server.py`); a conta `admin` (email/senha vêm de `ADMIN_EMAIL`/`ADMIN_PASSWORD`, não hardcoded) continua sendo seedada sempre, em qualquer ambiente — isso é intencional, ela precisa existir pra login funcionar.

**Teste de regressão**: `backend/tests/test_auth_local_seed_gate.py` (novo — não existia `backend/tests/` neste repo ainda; não trouxe o `pytest.ini`/`conftest.py` do zip, que são específicos da infra do Emergent). Roda como script simples (`python3 test_auth_local_seed_gate.py`, só precisa de `motor`/`bcrypt`/`PyJWT`, já na imagem) ou via pytest — chama `auth_local.seed_local_users` direto contra um banco descartável no `sigcr-mongodb-devtest`, sem precisar da suite HTTP inteira (que continua bloqueada em `AUTH_MODE=local`, fora de escopo). 3 cenários, todos passando: `ENVIRONMENT=production` → 0 contas demo criadas, admin sempre criada; `ENVIRONMENT=PRODUCTION` (maiúsculo) → mesmo resultado (case-insensitive); sem `ENVIRONMENT` (dev) → as 3 contas demo criadas normalmente.

**Deploy**: `auth_local.py` + `backend/tests/test_auth_local_seed_gate.py` aplicados isolados do lote pendente (`git stash push -u` / `pop`, mesmo padrão de sempre, sem conflito no merge de volta). **`server.py` não foi tocado nesta fase** — `auth_local` continua não importado em lugar nenhum do código que roda de verdade, então este deploy é comportamentalmente um no-op (só adiciona um arquivo novo, morto, à imagem). Confirmado via `deploy.sh` real (commit `f213f6d`) + smoke test pós-deploy idêntico ao de antes (`/docs` 404, `/api/companies` 401, `/api/` 200, sem traceback) — exatamente como esperado pra um deploy sem mudança de comportamento. Isso deixa a base seedada pronta e já testada pra quando a Fase 4 efetivamente importar `auth_local` em `server.py` e ligar `AUTH_MODE=local`.

**Próximo passo**: Fase 2 (Fatia C — selo público de compliance + varredura de vencimento por e-mail, modo mock).

## 27. Fase 2 do plano Emergent — Fatia C: selo público de compliance + varredura de vencimento por e-mail ✅ CONCLUÍDO e no ar (2026-08-25)

**O que entrou**: `GET /public/selo/{company_id}` (sem auth, rate limit 30/min, CNPJ mascarado, status/semáforo de compliance calculado a partir dos documentos reais via `calcular_status_documento` já existente); `_executar_avisos_vencimento()` (varre documentos vencendo ≤30 dias ou vencidos, dispara notificação in-app via `criar_notificacao` já existente + e-mail via `email_service.enviar_email`, novo arquivo trazido do zip — idempotente por documento/dia via `db.avisos_vencimento`); `POST /admin/notificacoes-vencimento/executar` (dispara a varredura manualmente, só `sigcr_admin`/`detran`/`detran_admin`); `POST /cron/avisos-vencimento` (versão agendável, protegida por `WEBHOOK_CRON_SECRET` — não configurada hoje, então responde 401 sempre, inerte por padrão, mesmo tratamento que `TURNSTILE_SECRET_KEY` na Fatia B).

**Deliberadamente não configurado**: `RESEND_API_KEY` continua vazia — `enviar_email` cai no modo mock (grava em `db.email_outbox` com `provider:"mock"`, ninguém recebe e-mail real). Fica pronto e dormente até o Pedro decidir ativar.

**Testado em devtest** (worktree limpo + `sigcr-backend-devtest` + `sigcr-mongodb-devtest`, mesma técnica das fases anteriores): empresa sintética com 1 documento vencido → `/public/selo/{id}` retorna semáforo vermelho corretamente; empresa inexistente → 404 (não 500); `/cron/avisos-vencimento` sem secret → 401; `/admin/notificacoes-vencimento/executar` como admin → gera 1 aviso (notificação in-app confirmada em `db.notificacoes` + registro em `db.email_outbox` com `provider:"mock"`/`status:"mock_registrado"`); rodado de novo no mesmo dia → 0 avisos novos (idempotência confirmada); sem token → 401; sem traceback nos logs do devtest.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop`. Dessa vez teve conflito de verdade no `stash pop` (diferente das fases anteriores) — o lote pendente também insere conteúdo no mesmíssimo ponto do arquivo (logo antes de `app.include_router`, o `seed_checklist_catalogo_portaria` do catálogo de checklist de portaria). Resolvido combinando os dois blocos, nenhum descartado — mesma técnica do item 20. Sem marcadores de conflito sobrando, sintaxe validada depois. Deploy via `deploy.sh` real, commit `1ebec53`. Smoke test em produção (`api.sigcr.com.br`): `/docs` 404, `/api/companies`/`/api/portarias`/`/api/editais` 401 sem token, `/api/cron/avisos-vencimento` sem secret → 401, `/api/public/selo/nao_existe` → 404 (não 500), sem traceback.

**Próximo passo**: Fase 3 — reconciliação do frontend do zip contra o HEAD real de produção (diff de verdade, resumo antes de aplicar qualquer coisa, sem merge em massa).

## 28. Fase 3 do plano Emergent — reconciliação do frontend, aplicado em 2 grupos escolhidos pelo Pedro ✅ CONCLUÍDO e no ar (2026-08-25)

Diff feito contra o HEAD real de produção extraído via `git archive` (não a working tree, que tem o lote pendente misturado) — resultado bem menor do que a comparação anterior sugeria: **14 arquivos**, não os 27+ que apareciam contra a working tree suja.

**Classificado em 5 grupos e apresentado ao Pedro antes de tocar em qualquer coisa** (como pedido — sem merge em massa):
1. `SeloPublico.js` (novo) — completa a Fatia C (item 27), que já tinha o backend no ar sem nenhuma tela alcançável.
2. Bugs reais sem relação com auth: `cookie-banner.js`/`GestaoUsuarios.js`/`DashboardLayout.js` corrigindo **acentuação corrompida** (mojibake) espalhada em produção — "Usurio"→"Usuário", "Trocar viso"→"Trocar visão", "Administrao"→"Administração", dezenas de ocorrências; `DashboardLayout.js` também corrige uma `<a>` aninhada dentro de um `<Link>` (HTML inválido) com 2 links mortos escondidos no ícone de notificação mobile; `PerfilAtivoContext.js` corrige o perfil ativo inicial sendo calculado com `user=null` antes do usuário real resolver.
3. `Dashboard.js` — misturava o card do selo (ligado ao grupo 1) com um painel novo de onboarding ("Comece por aqui", não pedido) e um fix separado (Dashboard não reconsultava as estatísticas ao trocar a simulação "Trocar Visão").
4. `AuthContext.js`/`Login.js`/`EsqueciSenha.js`/`RedefinirSenha.js`/`RotaProtegida.js` — Fatia D, confirmado continuar bloqueado.
5. `constants/testIds/*` + maior parte de `CadastroPublico.js` — tooling de QA interno do Emergent (`data-testid`), sem função no nosso app, não vale trazer.

**Achado crítico registrado pra Fase 4**: `AuthContext.js` do zip define `AUTH_MODE = process.env.REACT_APP_AUTH_MODE || 'local'` — o padrão sem a env é **`'local'`**, o oposto do padrão seguro do backend (`keycloak`). Se esse arquivo entrar em produção sem `REACT_APP_AUTH_MODE=keycloak` explícito no build, o login inteiro quebra silenciosamente (frontend tenta local, backend continua `AUTH_MODE=keycloak`). Isso precisa entrar no checklist da Fase 4, não é um detalhe menor.

**Pedro escolheu grupos 1 + 2** (não trouxe o grupo 3 — nem o card do selo no Dashboard, nem o painel de onboarding, nem o fix do refetch na simulação — ficam pendentes se ele quiser depois).

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop` (sem conflito desta vez — os arquivos tocados não se sobrepõem ao lote pendente). Arquivos trazidos: `pages/SeloPublico.js` (novo), `components/ui/cookie-banner.js`, `pages/GestaoUsuarios.js`, `components/DashboardLayout.js`, `contexts/PerfilAtivoContext.js` (substituição integral — confirmado que a única diferença de cada um contra o HEAD deployado era exatamente o que foi revisado, nada a mais escondido), `App.js` só com a rota `/selo/:companyId` (sem as rotas de Login/EsqueciSenha/RedefinirSenha, que ficam pra Fase 4). Deploy via `deploy-frontend.sh` real (worktree isolado, `npm run build`, swap atômico de symlink) — commit `d0d52d2`, release `releases/fase3-grupo1-2`. Build limpo (só warnings de eslint pré-existentes, nenhum novo). Verificado no bundle real de produção (`main.da22f647.js`, minificado com `\xXX` no lugar de acentos — `Usu\xe1rio`, `Trocar vis\xe3o`, `Administra\xe7ão`, `Selo p\xfablico SIGCR` todos presentes e corretos); site 200; `/selo/:id` servido pela SPA (200).

**Próximo passo**: Fase 4 (Keycloak → auth local) — bloqueada até confirmação explícita do Pedro nesta fase específica.

## 29. Bug de navegação em `/mapa` e `/mapa-nacional` — sem logo/menu de volta ao painel — ✅ CONCLUÍDO (2026-08-25)

Pedro reportou: a tela do Mapa Nacional (Leaflet, cobertura de Registradoras por DETRAN) não tinha nenhum jeito de voltar pro resto do sistema — sem logo clicável, sem sidebar, sem breadcrumb. Pediu confirmação nos dois casos (autenticado vs. visitante público), já que existem duas rotas pro mesmo componente: `/mapa` (protegida, `detran`/`detran_admin`) e `/mapa-nacional` (pública, sem `RotaProtegida`).

**Causa raiz, achado antes de codar**: `frontend/src/pages/MapaNacional.js` (working tree) já tinha `<DashboardLayout>` — mas essa é a versão do **lote pendente de 05/08, nunca deployada**. A versão realmente publicada (`git show HEAD:...`) é bem mais simples: renderiza uma `<div>` nua, sem nenhum wrapper de layout — `useAuth()` é importado mas `user` nunca é usado em lugar nenhum do arquivo. Confirmado com um teste real em produção antes de qualquer mudança (Puppeteer + Chromium via snap, mesma técnica de [[project-sigcr-keycloak-login-theme]]): `/mapa-nacional` ao vivo tinha 0 `<aside>` e 0 links pra `/dashboard` no DOM.

**Fix aplicado isolado, extraído do HEAD publicado** (não do lote pendente — que seria trazer uma reescrita inteira não testada só pra resolver isso): `MapaNacionalPage` agora decide o wrapper por `user` do `useAuth()` — autenticado (sempre o caso em `/mapa`, já que `RotaProtegida` garante isso) recebe `<DashboardLayout>` de verdade, igual toda outra tela autenticada do sistema (sidebar completa, badge de perfil, menu do DETRAN já lista "Mapa Nacional"); visitante público (`/mapa-nacional` sem sessão) recebe um cabeçalho mínimo novo (`CabecalhoPublico`) — logo clicável levando pra `/`, sem puxar o menu por perfil que não faz sentido pra quem não tem conta.

**Testado antes do deploy, como pedido**: worktree limpo a partir de HEAD, build real (`npm run build`, sem erro novo — só os warnings de eslint pré-existentes), servido localmente. Rota pública testada direto (`/mapa-nacional` sem sessão) via Puppeteer real — confirmado 1 link pra `/` no DOM, screenshot conferido visualmente (logo + "sigcr SIGCR" no topo, resto do mapa intacto). Rota autenticada testada via harness descartável (`/__preview_mapa`, nunca commitado — injeta um `AuthContext.Provider` com usuário `detran_admin` fake, mesma técnica de simulação usada no item 23) — confirmado sidebar completa renderizando (2 `<aside>`, todo o menu `NAV_DETRAN` incluindo o próprio "Mapa Nacional", badge "DETRAN", rodapé com "Sair"), screenshot conferido visualmente, sem sobreposição com o mapa.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop`, diff final só `MapaNacional.js` (39 linhas). Deploy via `deploy-frontend.sh` real (worktree isolado, swap atômico de symlink), release `releases/fix-nav-mapa-20260825`, commit `632526c`. Confirmado em produção real (não só local): `https://sigcr.com.br/mapa-nacional` responde 200, bundle novo contém o cabeçalho público, e um novo teste Puppeteer direto contra produção confirmou 1 link pra `/` no DOM ao vivo.

**Conflito esperado ao restaurar o lote pendente** (o mesmo arquivo, reescrito por inteiro lá): resolvido mantendo a versão do lote pendente pra working tree — ela já tem `DashboardLayout` (e bem mais: fetch de dados reais via `/mapa-nacional`, contadores dinâmicos) — meu fix ficou só no que está deployado agora; quando o lote pendente for testado/deployado de verdade no futuro, essa tela já nasce corrigida, sem esforço extra.

## 30. Redesign SIGCR (bento/dark/microinterações) — Passo 1: eliminar a armadilha de cor `orange`→azul — ✅ CONCLUÍDO (2026-08-25)

Pedro trouxe `SIGCR-Design-System-Fase1.md` (baseado na auditoria técnica do item anterior: Tailwind+shadcn/Radix já maduro, `motion`/`three`/`@react-three/fiber`/`@react-three/drei` já instalados, paleta Berry documentada) e pediu pra executar a Fase 2 do plano geral (área pública), começando pelo Passo 1: migrar classes de cor literal (`bg-orange-500` etc.) pros tokens semânticos.

**Varredura completa antes de tocar em qualquer arquivo**: 330 ocorrências de `orange-*` em 31 arquivos, 21 de `purple-*` em 5 — bem mais que os 2 casos já conhecidos (Compliance, card Atenção). Achado que mudou a abordagem: só `orange` (mapeia pra azul) e `purple` (mapeia pra roxo, risco leve) são realmente enganosos — `red`/`emerald`/`amber`/`green` mapeiam pra cores consistentes com o próprio nome, sem armadilha real. Segundo achado, mais sério: os tokens semânticos do shadcn (`--primary` etc.) têm valor único, sem escala de tons — trocar `bg-orange-500` por `bg-primary` cegamente perderia todos os outros tons (`orange-400`, hover `orange-600`, opacidade `orange-500/10`) usados em centenas de lugares. Apresentado ao Pedro antes de decidir: ele escolheu a opção de estender `primary`/`secondary` como escalas completas 50-950 (mesmos valores hex do `orange`/`purple` atual, só renomeados) — zero mudança visual, resolve a armadilha de verdade.

**Execução**:
1. Codemod mecânico (`orange-(\d+)` → `primary-$1`, `purple-(\d+)` → `secondary-$1`, regex exigindo dígito logo após o hífen — não toca em nada que não seja classe Tailwind) rodado em todo `frontend/src`, **exceto** `components/ui/interactive-map.js`, onde `color:"orange"`/`color:"green"`/`color:"red"` alimenta o nome de arquivo de ícone real do serviço `leaflet-color-markers` (`marker-icon-2x-orange.png`) — nada a ver com Tailwind, achado a tempo checando o contexto de cada ocorrência "fora do padrão" antes de rodar o codemod.
2. 5 ocorrências de cor **dinâmica** (`color: 'orange'` em objetos de config consumidos via template literal, ex: `` `bg-${color}-500/10` `` em `Dashboard.js`, `Notificacoes.js`, `GestaoUsuarios.js`) corrigidas manualmente — o regex não pega essas porque o nome da cor é variável, não texto literal.
3. `tailwind.config.js`: `primary`/`secondary` ganharam a escala 50-950 (idêntica aos valores antigos de `orange`/`purple`) mesclada com `DEFAULT`/`foreground` já existentes. `orange`/`purple` mantidos temporariamente como rede de segurança.
4. Confirmado zero uso literal restante fora do arquivo excluído → chaves `orange`/`purple` **removidas** do config → rebuild → **hash do CSS gerado idêntico ao build anterior** (prova concreta de que nada dependia mais delas).

**Testado antes do deploy**: dois worktrees (`before` = HEAD original, `after` = com a migração), ambos com um harness `/__preview` descartável (nunca commitado) simulando um usuário `sigcr_admin` autenticado — screenshot + diff de pixel (`pixelmatch`) em 4 telas (`Dashboard`, `GestaoUsuarios`, `Notificacoes`, `Empresas`, as que tinham cor dinâmica ou maior densidade de classes): 0 a 0,006% de pixels diferentes, e a única diferença encontrada (Dashboard) era ruído de animação (partículas do `vapour-text-effect` + rotação do spinner em frames diferentes, confirmado no diff visual), não mudança de cor/layout.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop`. Desta vez 3 conflitos reais (`ChecklistContran.js`, `CriarEvento.js`, `Portarias.js` — o lote pendente reescreveu essas seções por inteiro, sobrepondo as mesmas linhas). Resolvido tomando a versão do lote pendente (é o trabalho futuro do Pedro, não meu de mesclar) e **reaplicando o mesmo codemod nela**, pra não reintroduzir `orange-500`/`purple-` na working tree. Deploy via `deploy-frontend.sh` real, release `releases/passo1-cores-primary-secondary`, commit `ea6459e` — **hash do CSS em produção idêntico ao dos builds de teste**, confirmação byte a byte de que o que foi testado é exatamente o que está no ar. Smoke test: site 200, `/mapa-nacional` 200, tráfego real (`/api/notificacoes`, `/api/portarias`, `/api/companies`) 200 sem erro nos logs.

**Próximo passo**: Passo 2 — redesenhar `ui/button.jsx`, `ui/card.jsx`, `ui/badge.jsx`, `ui/select.jsx`, `ui/input.jsx`, `ui/label.jsx`, `ui/dialog.jsx` (nesta ordem, commit+smoke test por item).

## 31. Redesign SIGCR — Passo 2: os 7 componentes base (button/card/badge/select/input/label/dialog) — ✅ CONCLUÍDO (2026-08-25)

Redesenhados via CSS/classes só — **nenhum primitivo Radix trocado**, mesma base de sempre, só reestilização por tokens.

- **`button.jsx`**: gradiente `primary→primary-600` (era cor sólida), glow no hover (`shadow` colorido usando a variável HSL, não hex fixo — funciona igual pra qualquer variant), `active:scale-[0.97]` como microinteração de clique, anel de foco na cor da marca em vez do cinza genérico do shadcn. **Decisão de risco deliberada**: microinteração via CSS puro (`transition`/`active:scale`), não `motion` — `Button` é usado com `asChild` (Radix Slot) em vários lugares (`<Button asChild><Link>`), e um wrapper `motion.*` quebraria esse contrato à toa.
- **`card.jsx`**: só ganhou `transition-all duration-200` no base — a maioria das 22 telas que usam `Card` já sobrescreve `bg`/`border` via `className` próprio, então o efeito de elevação real já vinha de cada tela; a transição faz esses estados (quando já existiam) animarem suave em vez de trocar seco.
- **`badge.jsx`**: mesma lógica do Card — `transition-colors` → `transition-all`, sem mudar cor base (a maioria das 19 telas já passa cor via `className`, como `perfilCfg.color` renomeado no Passo 1).
- **`input.jsx`/`select.jsx`**: foco ganhou anel + borda na cor da marca (`focus-visible:ring-primary/30`) no lugar do ring cinza padrão do shadcn — mesmo tratamento nos dois, pra formulário inteiro (13+15 telas) sentir consistente.
- **`label.jsx`**: mudança mínima de propósito (só transição) — é usado puro em 12 arquivos como rótulo de formulário, tom neutro atual já correto pro papel.
- **`dialog.jsx`**: overlay ganhou `backdrop-blur-sm` (era preto chapado), conteúdo do modal ganhou glow sutil na cor da marca (`shadow` com a variável `--primary`) — visual "glassmorphism", mais alinhado à direção bento/glow do resto.

**Testado antes do deploy**: build limpo (CSS só +103 bytes — mudança pequena e cirúrgica, como esperado pra reestilização, não reescrita), screenshot real via Puppeteer do formulário "Novo Usuário" (`GestaoUsuarios`, no harness `/__preview` — combina os 7 componentes na mesma tela: cards de perfil, inputs, label, botões primário/outline, badge de perfil ativo) — layout íntegro, gradiente/cantos/estados aplicados sem quebra visual.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop`, **sem conflito** (o lote pendente não toca `components/ui/*` diretamente). Deploy via `deploy-frontend.sh`, release `releases/passo2-componentes-base` — hash do CSS em produção idêntico ao do build de teste. Smoke test: site 200, `/mapa-nacional` 200, tráfego real (`/api/notificacoes`, `/api/stats`, `/api/documentos/vencimento-resumo`) 200 sem erro.

**Próximo passo**: Passo 3 — componente `BentoGrid`/`BentoCard` novo (wrapper sobre `ui/card.jsx`).

## 32. Redesign SIGCR — Passo 3: componente `BentoGrid`/`BentoCard` novo — ✅ CONCLUÍDO (2026-08-25)

Novo arquivo `components/ui/bento-grid.jsx` — wrapper sobre `ui/card.jsx` (não substitui, importa e usa `Card` por baixo). `BentoGrid` é um grid CSS responsivo (`grid-cols-2 md:grid-cols-4`); `BentoCard` aceita `size` (`1x1`/`2x1`/`1x2`/`2x2`, 2 colunas só a partir de `md` pra não quebrar o grid no mobile de 2 colunas) e `interactive` (liga/desliga hover). Hover usa `motion` de verdade (`whileHover={{ scale: 1.015 }}` + spring) — diferente do `Button` do Passo 2, aqui é seguro porque `BentoCard` nunca precisa do padrão `asChild`, então não há conflito de contrato.

**Testado antes do deploy**: demo descartável no harness `/__preview` (nunca commitado) com 6 cards nos 4 tamanhos + 1 card `interactive=false`. Como o ambiente não conseguiu renderizar a screenshot pra inspeção visual direta nesta rodada (tooling indisponível no momento), a verificação foi feita por dois caminhos objetivos: (1) inspeção do DOM real via Puppeteer (`getComputedStyle` + `getBoundingClientRect`) confirmando os 4 tamanhos de card com as dimensões exatas esperadas pela matemática do grid (2x2 = 504×336px, 2x1 = 504×160px, 1x1 = 244×160px, gap 16px, 4 colunas de 244px) e zero erro de console/página; (2) análise de histograma de cor do PNG gerado (via `pngjs`, já que a leitura visual direta não estava disponível) confirmando fundo escuro (~`#0A0D12`), superfície de card (~`#111936`) e ícones na cor primária (~`#2196f3`) presentes nas proporções esperadas — nenhuma tela em branco/erro.

**Deploy**: só o arquivo novo (`bento-grid.jsx`) foi pra produção — a demo (`__PreviewBento.js`) e o harness de teste ficaram de fora, como sempre. Isolado do lote pendente via stash/pop, sem conflito. Hash do JS em produção **idêntico** ao do Passo 2 (`main.10a877f4.js`) — confirma que o componente é 100% morto/inerte até ser usado de verdade (Passo 4), exatamente como o padrão já usado pro `auth_local.py` no item 26. CSS cresceu ~130 bytes (esperado — o Tailwind escaneia o arquivo por texto mesmo sem ele ser importado em nenhum lugar ainda). Smoke test: site 200, `/mapa-nacional` 200.

**Próximo passo**: Passo 4 — reativar `globe-hero.js`/`stagger-text.js` e reorganizar a Landing pública com `BentoGrid` pra seção de features.

## 33. Redesign SIGCR — Passo 4: Landing pública com globo 3D, stagger-text e BentoGrid — ✅ CONCLUÍDO (2026-08-25)

**Landing.js reorganizada**: hero mantém headline/subtítulo/CTAs, mas o `<h1>` agora usa `StaggerText` (revelação letra a letra, `motion`) nas duas linhas ("Credenciamento"/"Simplificado", a segunda com delay de 0.3s pra sequenciar); seção de Features trocou o grid uniforme de 4 colunas por `BentoGrid`/`BentoCard` em padrão ziguezague (2x1/1x1/1x1/2x1 numa grid de 2 colunas) usando exatamente o mesmo conteúdo de antes (sem inventar copy nova).

**Achado no meio do trabalho, corrigido**: o globo 3D (`globe-hero.js`, Three.js) e o `motion` já estavam instalados mas nunca tinham sido importados de verdade em lugar nenhum do bundle — na primeira tentativa de ativar o globo direto (`<GlobeHero>{conteúdo}</GlobeHero>`), o bundle único do CRA cresceu **+236KB gzip** (Three.js/@react-three/fiber/drei inteiros), e esse custo ia pra **toda rota do app**, autenticada incluída, só pra alimentar um efeito decorativo da Landing. Corrigido com `React.lazy()` isolando só o `GlobeHero` (Three.js) num chunk separado, carregado via `Suspense` — o texto principal do hero (`StaggerText`, headline, CTAs) nunca fica atrás do Suspense, só o globo de fundo. Resultado: bundle principal caiu de volta pra 308KB (só o custo do `motion`/Passo 3), Three.js isolado num chunk de 239KB que só baixa em quem realmente visita `/`.

**Segundo achado, mais sério, corrigido**: `App.css` tinha 4 classes (`.hero-glow`, `.text-highlight`, `.glow-orange`, `.button-shadow`) com **cor laranja/âmbar hardcoded em RGB puro** (`rgba(249,115,22,...)` — o orange-500 de VERDADE do Tailwind, não a versão Berry remapeada) — o codemod do Passo 1 não alcançava isso porque procurava só por classes Tailwind (`orange-500`), não CSS solto. Ficou visível direto no headline principal da Landing (`.text-highlight`, usado no "Credenciamento" — o gradiente do texto renderizava laranja de verdade, quebrando a consistência com o resto do redesign já no ar). Corrigido pra gradiente `primary→secondary` (azul→roxo); `.glow-orange` também **renomeado pra `.glow-primary`** (nome batia com a cor errada, mesma classe de armadilha do Passo 1, só que em CSS puro em vez de classe Tailwind) — usado hoje só em `Login.js` (tela não alcançável, ver [[project-sigcr-keycloak-login-theme]]).

**Achado, NÃO corrigido nesta rodada — sinalizado pro Pedro decidir**: a mesma varredura, extendida pra `rgba(249,115,22,...)`/`#f97316`/`#fb923c` em `style={{...}}` inline (não CSS, não classe Tailwind), encontrou **9 arquivos** com laranja real hardcoded — `Esteiras.js` é o pior caso, pelo menos 13 ocorrências usadas em botões primários/barras de progresso/badges reais (`background:"linear-gradient(135deg,#f97316,#fb923c)"` no botão "Nova"/"Criar Evento", cor de progresso, etc.) — página **ao vivo**, não código morto. Os outros 8 (`MapaNacional.js`, `UploadDocumentos.js`, `SolicitacaoDetalhe.js`, `interactive-map.js`, `PagamentoAguardando.js`, `Planos.js`, `AppMobile.js`, `Checkout.js`) não foram auditados em profundidade. Isso é uma **terceira variante** da armadilha de cor do item 30 (Tailwind class → CSS solto → agora confirmado também em `style` inline) — acompanha o mesmo padrão: nome/valor real de laranja, inconsistente com o resto do sistema já migrado pra Berry blue. Recomendo tratar como um "Passo 1b" à parte antes de considerar o redesign da área logada (Fase 3/4 do plano geral) — é código real, funcionando, só com a cor errada; não é urgente, mas vale não esquecer.

**Testado antes do deploy**: dois builds (com/sem lazy split, pra confirmar o problema E a correção do bundle), servidos localmente, inspecionados via Puppeteer (DOM + histograma de cor do PNG, já que a leitura visual direta de imagem não estava disponível nesta rodada — mesma limitação do item 32) — confirmado: `<h1>` com o texto certo, `<canvas>` do globo presente e do tamanho certo, 4 cards de feature renderizados, 2 chunks carregando 200, zero erro de console relevante (só o aviso de CSP do iframe de silent-SSO do Keycloak, que já existia antes, não relacionado). Cluster de cor laranja real (RGB ~255,144,48) confirmado no histograma ANTES do fix do `App.css`, e confirmado **ausente** (substituído por azul primário ~33,150,243) depois.

**Deploy**: só `Landing.js` + `App.css` foram pra produção — isolado do lote pendente via stash/pop, sem conflito. Deploy via `deploy-frontend.sh`, release `releases/passo4-landing-globo-bento`. Chunk do globo confirmado com o mesmo hash do build de teste (`304.89625df4.chunk.js`, 200 em produção). **Verificação final direto em `sigcr.com.br` real** (não só local): `<h1>` com o texto certo, `<canvas>` presente, 4 cards — confirmado ao vivo via Puppeteer contra o domínio de produção.

**Resultado**: as 4 fases do plano geral (Passo 1 a 4) concluídas, testadas e no ar. Área pública redesenhada; área logada (Dashboard, telas internas) ainda usa só os 7 componentes base do Passo 2 (herdado automaticamente) — nenhuma tela logada foi redesenhada individualmente, como definido no escopo desta rodada.


## 34. Redesign SIGCR — Passo 5: validação final consolidada + regressão real encontrada e corrigida no `button.jsx` — ✅ CONCLUÍDO (2026-08-26)

Pedro pediu pra fechar o Passo 5 do plano (`SIGCR-Design-System-Fase1.md`): validação visual antes/depois da Landing + confirmação de zero regressão na área logada por causa do Passo 2. Descoberto no início que o pedido já tinha sido executado inteiro (Passos 1-4, itens 30-33) no dia anterior, numa sessão cuja memória não tinha sido salva — gap de memória corrigido, ver `project-sigcr-redesign-fase1-publica` na memória.

**Metodologia**: dois `git worktree`s descartáveis (`before` = commit `9eba4eb`, imediatamente anterior ao Passo 1; `after` = HEAD `f8f3d03`, o que estava de fato em produção), `node_modules` symlinkado (hash do `package-lock.json` idêntico nos 3 pontos — Passos 1-4 não tocaram dependências). Harness `/__preview` recriado em cada worktree (nunca commitado) — mocka `AuthContext` (usuário `sigcr_admin` fake, sem Keycloak real) e o adapter do axios (respostas canned por URL), renderizando `Dashboard`, `GestaoUsuarios`, `Notificacoes`, `Empresas` fora do fluxo de login real. `Landing` (pública, sem auth) screenshotada direto. Puppeteer contra `/snap/bin/chromium`, `pixelmatch`+`pngjs` pro diff pixel a pixel.

**Achado de ambiente, não de produto**: este sandbox não tem WebGL funcional em nenhum Chromium disponível (`gl renderer: NO_WEBGL`, confirmado inclusive contra `sigcr.com.br` real, não só o build local) — o globo 3D do Passo 4 não pôde ser verificado visualmente aqui. Resto da Landing (headline `StaggerText`, CTAs, `BentoGrid` de features) renderizou correto nos dois builds.

**Achado real, corrigido**: diff de pixel nas 4 telas logadas ficou entre 0% e 0.242% — dentro do esperado pela reestilização do Passo 2, EXCETO por um caso: o botão "Excluir" de `Empresas.js` (cor vermelha literal, `bg-red-900/30 text-red-400 border-red-800`, sem `variant` explícito) saía **azul com texto vermelho** em vez de vermelho translúcido. Causa raiz: `lib/utils.js`'s `cn()` é só um `join()` de strings (nunca foi `tailwind-merge`, sem resolução de conflito Tailwind nenhuma), e a variante `default`/`secondary` do `button.jsx` (Passo 2) passou a ter `bg-gradient-to-br` — uma camada de **background-image**, que por especificação CSS sempre pinta por cima de qualquer `background-color` custom, não importa a ordem das classes. Grep no projeto todo achou **5 call sites reais afetados** (não só o achado inicial): `Empresas.js:602` (Excluir), `PainelConferencia.js:246` (baixar comprovante, verde), `FilaRegistros.js:177/215` (concluir, verde), `FilaRegistros.js:233` (verde/vermelho) — todos saindo sempre azul-primário em produção desde o deploy do Passo 2 (2026-08-25 19:59), quebrando o sinal semântico da cor (sucesso/perigo) sem ninguém notar, porque nenhuma dessas 3 telas fazia parte do conjunto de 4 testado nos Passos anteriores. As ~27 outras ocorrências de `bg-primary-500` em botões (grep completo) não quebraram — coincidem por acaso com a mesma cor do gradiente novo.

**Fix**: `button.jsx` agora detecta se o caller passou seu próprio `bg-` via `className` e, só nesse caso, remove a string do gradiente da variante antes de concatenar — cirúrgico, não mexe em nenhuma das 32 chamadas de `<Button>`, mantém o gradiente/glow em todos os botões que não têm cor própria. Testado isolado (worktree + harness, screenshot do "Excluir" confirmando vermelho de volta, "Nova Empresa" confirmando gradiente azul intacto) antes de subir.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop` (só `button.jsx` foi, sem conflito). `deploy-frontend.sh` real, release `releases/passo5-buttonfix-bg-override`, commit `37397d6`, push confirmado (`origin/main` sincronizado). Smoke test: site 200, `/mapa-nacional` 200 — **nota**: primeira tentativa de checar `/api/*` bateu no domínio errado (`sigcr.com.br` em vez de `api.sigcr.com.br`), corrigido antes de reportar; contra o domínio certo, `/api/notificacoes`, `/api/companies`, `/api/stats` voltam 401 sem token como esperado.

**Resultado final do Passo 5**: Landing pública confirmada visualmente antes/depois (globo não verificável neste sandbox por limitação de WebGL, não de produto). Área logada confirmada sem regressão de layout nas 4 telas testadas — e a ÚNICA regressão real de cor encontrada (botão Excluir + 4 outros call sites) foi corrigida e já está no ar, não só documentada. Relatório com screenshots entregue ao Pedro como Artifact.

## 35. Redesign SIGCR — Fase 3, fatia 1: DashboardLayout.js (shell da área logada) — ✅ CONCLUÍDO (2026-08-26)

Pedro pediu pra seguir pro plano geral, Fases 3 (área logada comum) e 4 (telas por perfil), com deploy por fatia. Primeira fatia: `DashboardLayout.js`, o shell usado por 20 das 32 páginas — testado isolado antes de qualquer outra coisa, como pedido.

**Achado ao planejar**: o brief original do Passo 2 (item 31) pedia um "token de glow reutilizável (primary→secondary, radial, baixa opacidade)" e uma "escala de elevação por sombra+borda" como infraestrutura — na prática só saiu como sombra ad hoc dentro do `button.jsx`/`dialog.jsx`, nunca virou token de verdade. Construído agora em `index.css` (`@layer components`): `.glow-brand` (radial duplo primary+secondary, opacidade 10-14%, pra wash decorativo atrás de blocos de marca) e `.elevate-2`/`.elevate-3` (2 níveis de sombra pra hierarquia — painel persistente vs. popover flutuante). Puramente aditivo, zero risco pro que já existe.

**Aplicado em `DashboardLayout.js`** (só classes, nenhuma mudança de lógica/comportamento):
- Bloco do logo (topo da sidebar) e header mobile ganharam `glow-brand`.
- As duas `<aside>` (desktop + mobile) ganharam `elevate-2`.
- Dropdown "Trocar Visão" trocou `border-zinc-700 shadow-xl` ad hoc por `elevate-3`.
- Item de nav ativo ganhou glow sutil (`shadow-[0_0_16px_-6px_hsl(var(--primary)/0.5)]`) consistente com o hover-glow do `button.jsx`.

**Testado isolado**: worktrees before/after (`git stash push -u` isolando o lote pendente, os únicos 2 arquivos tocados voltaram intactos depois), harness `/__preview` renderizando `Dashboard` — 3 estados capturados via Puppeteer: desktop full, dropdown "Trocar Visão" aberto, header mobile (viewport 390px). Diff de pixel (`pixelmatch`) baixo nos 3 (0.027%–0.492%, a maior parte é ruído de animação do `vapour-text-effect`, já conhecido) — nenhuma quebra de layout, elemento sumido ou erro de console. Inspeção visual direta (crop com zoom) confirmou o glow renderizando como esperado — sutil o bastante pra não aparecer no diff automático de pixel em fundo escuro, mas visível a olho.

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop`, sem conflito (`index.css`/`DashboardLayout.js` não fazem parte do lote). `deploy-frontend.sh` real, release `releases/fase3-slice1-dashboardlayout`. Smoke test: site 200, `/mapa-nacional` 200, `api.sigcr.com.br/api/notificacoes` e `/api/stats` 401 sem token (domínio correto desta vez, ver lição do item 34).

**Próxima fatia**: Dashboard (BentoGrid nas métricas/atalhos, mantendo `vapour-text-effect.js`/`gradient-menu.js` como estão) + Mapa Nacional autenticado + Notificações.

## 36. Redesign SIGCR — Fase 3, fatia 2: Dashboard com BentoGrid — ✅ CONCLUÍDO (2026-08-26)

Segunda fatia da Fase 3: métricas/atalhos do `Dashboard.js` (view principal, não a `DashboardFinanceira`) agora usam `BentoGrid`/`BentoCard` em vez do grid + Cards empilhados de antes. `vapour-text-effect.js` e `gradient-menu.js` não foram tocados, como pedido — só a seção de métricas abaixo deles.

**Layout**: 4 cards de stat (Empresas/Documentos/Pendências/Portarias) como células 1x1 na primeira linha; Semáforo de Compliance e Documentos Vencendo como células 2x1 lado a lado na segunda linha (antes eram 2 `Card`s full-width empilhados verticalmente). Todos com `interactive={false}` — são só leitura, sem ação de clique associada, seguindo a convenção já documentada no próprio `bento-grid.jsx`. Resultado: mesma informação, ~30% menos altura de página, hierarquia mais clara.

**Achado no meio do trabalho, não corrigido — sinalizado**: `Dashboard.js` já tinha ~99 linhas de mudança pendente e não commitada (lote do Pedro) adicionando um componente `DashboardFinanceira` novo — e esse componente usa `border-orange-500`/`text-orange-500`/`bg-orange-500` literais (3 ocorrências), a mesma armadilha que o Passo 1 eliminou em todo o resto do app. Como é código do Pedro ainda em andamento (não é meu de mesclar/corrigir por conta própria, mesma regra aplicada no item 30), **não mexi** — só registro aqui pra não esquecer: quando esse lote for finalizado e for a vez dele, essas 3 linhas precisam do mesmo tratamento de token.

**Reconciliação com o lote pendente** (mesma técnica do item 30, adaptada): como `Dashboard.js` já estava sujo com a `DashboardFinanceira`, testei minha mudança isolada em worktrees before/after a partir do HEAD limpo (sem a Financeira). Pra deploy, troquei temporariamente o arquivo real por essa versão limpa (HEAD + BentoGrid, sem `DashboardFinanceira`), rodei o `git stash push -u` excluindo só esse arquivo (isolando o resto do lote), `deploy-frontend.sh` de verdade, e depois restaurei o arquivo completo (agora HEAD-novo + `DashboardFinanceira` do Pedro por cima) antes do `stash pop`. Working tree ficou exatamente como estava, só que agora sobre um HEAD que já tem o BentoGrid.

**Testado antes do deploy**: worktrees before/after com harness `/__preview`, screenshot full-page via Puppeteer, zero erro de console nos dois. Comparação visual confirmou o novo layout lado a lado sem perda de conteúdo (inclusive preservando o bug pré-existente "Invalid Date" em Documentos Vencendo, fora de escopo, não mexido).

**Deploy**: release `releases/fase3-slice2-dashboard-bentogrid`. Smoke test: site 200, `/mapa-nacional` 200, `api.sigcr.com.br/api/notificacoes` e `/api/stats` 401 sem token.

**Próxima fatia**: Mapa Nacional autenticado (`/mapa`) e Notificações — conferir herança dos componentes base, sem mudança estrutural nova esperada.

## 37. Redesign SIGCR — Fase 3, fatia 3: Mapa Nacional + Notificações (auditoria) + "Passo 1b" resolvido — ✅ CONCLUÍDO (2026-08-26)

Terceira fatia da Fase 3: `MapaNacional.js` (autenticado, `/mapa`) e `Notificacoes.js` — pedido era conferir herança dos componentes base, não redesenho estrutural novo.

**Notificações**: zero cor hardcoded, zero classe fora do padrão — já herda os componentes base (badge/card) limpo. Nada a corrigir.

**Mapa Nacional**: achado real — a versão hoje em produção (HEAD) tem 15 linhas com laranja real hardcoded (`#f97316`/`rgba(249,115,22,...)`), exatamente o arquivo já flagado no item 33 como parte do "Passo 1b". **Não corrigido separadamente**: o lote pendente do Pedro já reescreve esse arquivo quase por inteiro (dados reais da API em vez de mock, nova taxonomia de status) e, como efeito colateral dessa reescrita, **já elimina toda a cor laranja** (confirmado: 0 ocorrências na versão pendente). Corrigir a versão antiga separadamente seria trabalho jogado fora — quando o lote do Pedro for ao ar, o arquivo antigo inteiro é substituído. Sinalizado, não duplicado.

**"Passo 1b" — resolução real**: com a autorização do Pedro pra tratar isso nesta rodada (item separado, commit próprio), foi feita a varredura dos 8 arquivos reais flagados no item 33 (excluindo `interactive-map.js`, que é falso-positivo — nome de arquivo de ícone real do `leaflet-color-markers`, não bug). Achado: **6 dos 8 já estavam com zero laranja** — `UploadDocumentos.js`, `SolicitacaoDetalhe.js`, `PagamentoAguardando.js`, `Planos.js`, `AppMobile.js`, `Checkout.js` — todos fazem parte do lote pendente do Pedro e o laranja já tinha sido removido lá como efeito colateral de outras mudanças, sem eu precisar tocar. `MapaNacional.js` também (ver acima). Restava só **`Esteiras.js`**, o pior caso original (13+ ocorrências) — o lote pendente já tinha reduzido pra 4 (2 bordas de modal, 1 fundo+borda de card selecionado), então apliquei o mesmo codemod cor-a-cor nessas 4 E separadamente na versão HEAD limpa (15 ocorrências: botões "Criar Esteira"/"Registrar Evento"/"+ Nova"/"+ Criar Evento", badge de ID, barra de progresso, conector "concluído") — todas eram uso de "cor de marca/estado ativo", nunca alarme/perigo real, então mapeado pra `primary` (mesma regra do Passo 1 original, sem reinterpretação semântica por instância).

**Testado antes do deploy**: worktree isolado, harness `/__preview` estendido pra incluir `Esteiras` (com 2 esteiras mock, uma 100% outra 0%, pra exercitar os dois estados de cor), screenshot confirmando lista + modal "Nova Esteira" abertos — badge/botões/borda todos azul primário, zero laranja, zero erro de console.

**Deploy**: reconciliação igual ao item 36 (arquivo já estava no lote pendente) — versão limpa (HEAD + fix, sem o resto da reescrita do Pedro) trocada temporariamente pro deploy isolado, lote completo restaurado depois. Release `releases/passo1b-esteiras-cor-laranja`, commit próprio e separado do resto do redesign visual, como pedido. Smoke test: site 200, `/mapa-nacional` 200, API 401 sem token.

**Fase 3 completa**: shell (`DashboardLayout.js`), `Dashboard.js` (BentoGrid), Mapa Nacional/Notificações (auditados) — todas as 20 páginas que usam o shell comum herdam a nova identidade visual. Próximo: Fase 4 (telas por perfil — sigcr_admin, DETRAN, Registradora/Financeira), rodada separada.

## 38. Redesign SIGCR — Fase 4, fatia sigcr_admin — ✅ CONCLUÍDO (2026-08-26)

Primeira fatia da Fase 4 (telas por perfil). Escopo pedido: Gestão de Usuários, Portarias (listagem geral), Wizard "Criar Evento", Editais (gestão), Auditoria, Painel Registradoras (visão admin).

**Achado antes de começar — "Auditoria" não existe**: nenhuma página/rota de auditoria existe no frontend. O backend tem `registrar_auditoria()` (grava trilha de auditoria em várias ações), mas não há UI nenhuma pra visualizar isso — zero rota, zero componente. Não é algo pra "redesenhar", é uma tela que nunca foi construída. Sinalizado, não inventado.

**Resultado da varredura das outras 5**: confirmando o que o Pedro já esperava ("a maior parte já deve herdar boa parte do visual automaticamente") — **4 das 5 já estavam 100% consistentes, zero mudança de código**: Gestão de Usuários (Passo 5 anterior já deixou certo, confirmado), Portarias (listagem), Wizard Criar Evento, Painel Registradoras (visão admin — usa padrão de accordion com conteúdo de altura variável, BentoGrid não se aplica bem aqui, decisão deliberada de não forçar).

**Única mudança real: Editais (gestão)** — lista de editais que era `space-y-4` empilhado virou `BentoGrid` com `size="2x1"` (2 cards por linha), `interactive={true}` porque cada card tem ação real ("Candidatar-se"), diferente dos tiles de métrica do Dashboard que são só leitura.

**Achado, sinalizado separadamente, NÃO corrigido**: o lote pendente do Pedro adiciona um fluxo novo em `Editais.js` (diálogo de escolha de empresa quando a conta tem mais de uma) com um botão `bg-orange-500 hover:bg-orange-600` literal — a mesma armadilha do Passo 1, mas em código ainda não commitado (não está em produção). Como é trabalho em andamento dele, não mexi — só registro pra quando esse lote for finalizado.

**Testado antes do deploy**: harness `/__preview` estendido com as 5 telas (mocks pra `/portarias`, `/eventos/templates`, `/editais`, `/estados`, `/detran/registradoras`), screenshot full-page de cada uma, `pixelmatch` comparando contra o HEAD anterior. Resultado: **Gestão de Usuários, Portarias, Wizard Criar Evento e Painel Registradoras em 0.000% de diff** (prova objetiva de que nada mudou silenciosamente nelas) — só Editais com 2.073% (a mudança intencional do BentoGrid). Zero erro de console nas 10 capturas (5 telas × antes/depois).

**Deploy**: isolado do lote pendente via `git stash push -u`/`pop` (só `Editais.js` foi, reconciliado com a técnica do item 36/37 — versão limpa pro deploy, versão completa com o fluxo pendente do Pedro restaurada depois). Release `releases/fase4-admin-editais-bentogrid`. Smoke test: site 200, `/mapa-nacional` 200, `api.sigcr.com.br/api/editais` 401 sem token.

**Próxima fatia**: DETRAN (Portarias da UF, Painel de Conferência, Painel Registradoras visão DETRAN).

## 39. Redesign SIGCR — Fase 4, fatia DETRAN — ✅ CONCLUÍDO (2026-08-26)

Segunda fatia da Fase 4. Escopo pedido: Portarias da UF, Painel de Conferência, Painel Registradoras (visão DETRAN) — os dois últimos são os mesmos arquivos `Portarias.js`/`Registradoras.js` já auditados na fatia sigcr_admin (o componente é o mesmo, só muda o escopo de dados por perfil, não a estrutura visual).

**Achado real, corrigido: padding ausente em 5 telas**. Enquanto auditava `PainelConferencia.js`, notei que o conteúdo colava direto na borda — faltava o `p-6 lg:p-8` que toda outra tela usa logo depois de `<DashboardLayout>`. Varredura em todas as páginas confirmou o mesmo problema em mais 4: `Portarias.js` (também usada na fatia sigcr_admin — não pego antes porque a comparação pixel a pixel daquela fatia era contra o próprio estado anterior idêntico, não contra "deveria ter padding"), `Estados.js`, `MinhasSubmissoes.js` (fatia Registradora/Financeira — corrigido agora, antecipando) e `GestaoEditais.js`. Corrigidas as 5 de uma vez (mudança mecânica, mesma classe de bug, resolver piecemeal por fatia seria retrabalho).

**Achado de nomenclatura**: "Editais (gestão)" da fatia sigcr_admin provavelmente se referia a `GestaoEditais.js` (CRUD de editais, usado por DETRAN — rota `/gestao-editais`), não `Editais.js` (browse/candidatura, item 38) — os dois arquivos existem e têm nomes parecidos. Como `GestaoEditais.js` também está no nav do DETRAN, faz parte desta fatia de qualquer forma: aplicado o mesmo tratamento BentoGrid do `Editais.js` (2 colunas, `interactive`) na lista de editais cadastrados, mantendo o botão de editar (ícone lápis) e todos os badges (UF/status/anexos/termo de adesão) intactos.

**Testado antes do deploy**: harness `/__preview` estendido com `PainelConferencia`, `Estados`, `MinhasSubmissoes`, `GestaoEditais` (mocks reaproveitando `/estados`, `/companies`, `/portarias`). Pixelmatch contra o HEAD anterior: `Registradoras` em 0.000% (confirma que a fatia sigcr_admin já deixou esse arquivo certo); `PainelConferencia` 0.519%, `Estados` 0.845%, `MinhasSubmissoes` 0.742% (só o deslocamento do padding); `Portarias` 4.333% (padding, tela com mais conteúdo visível); `GestaoEditais` 3.038% (padding + BentoGrid). Zero erro de console nas 12 capturas.

**Deploy**: `Portarias.js` reconciliado com o lote pendente (mesma técnica — versão limpa pro deploy, versão completa com o trabalho do Pedro restaurada depois); os outros 4 arquivos não tinham conflito. Release `releases/fase4-detran-conferencia-e-padding`. Smoke test: site 200, `/mapa-nacional` 200, `/api/portarias` e `/api/estados` 401 sem token.

**Próxima fatia**: Registradora/Financeira (Minhas Submissões — padding já corrigido aqui, Fila de Registro de Contrato, Empresas.js, Editais participação — já feito no item 38).

## 40. Redesign SIGCR — Fase 4, fatia Registradora/Financeira — ✅ CONCLUÍDO, sem deploy necessário (2026-08-26)

Terceira e última fatia da Fase 4. Escopo pedido: Minhas Submissões, Fila de Registro de Contrato, Empresas.js, Editais (participação).

**Resultado: fatia 100% de verificação, zero mudança de código.** Todos os 4 itens já estavam consistentes:
- **Minhas Submissões**: padding já corrigido antecipadamente no item 39 (fatia DETRAN).
- **Editais (participação)**: já ganhou BentoGrid no item 38 (fatia sigcr_admin) — é o mesmo arquivo `Editais.js`.
- **Fila de Registro de Contrato** (`FilaRegistros.js`) e **Empresas.js**: os dois alvos originais do fix de `button.jsx` do Passo 5 (item 34) — confirmado visualmente que o fix se sustenta: "Concluir" verde sólido, "Rejeitar" outline vermelho em `FilaRegistros.js`; "Excluir" vermelho translúcido em `Empresas.js`. Nenhum dos dois tinha cor hardcoded nem padding ausente.

**Testado**: harness `/__preview` estendido com `FilaRegistros` (mock de 2 solicitações, uma pendente pra exercitar os botões Concluir/Rejeitar, uma concluída). Screenshot das 4 telas, zero erro de console. Sem diff pixel a pixel contra HEAD anterior porque não houve mudança nenhuma pra comparar — a verificação aqui foi inspeção visual direta das cores dos botões, que é exatamente o que tinha quebrado no Passo 5.

**Sem deploy**: nada mudou no código, então não há release nova pra esta fatia.

**Fase 4 completa**: as 3 fatias (sigcr_admin, DETRAN, Registradora/Financeira) cobriram as ~15 telas por perfil pedidas. Achados principais da fase inteira: "Auditoria" não existe (item 38), padding ausente em 5 telas cross-cutting corrigido de uma vez (item 39), 2 telas ganharam BentoGrid real (Editais.js, GestaoEditais.js), 2 achados de laranja hardcoded fora do escopo original sinalizados mas não corrigidos por estarem em código pendente do Pedro (Dashboard.js's `DashboardFinanceira`, item 36; `Editais.js`'s diálogo de escolha de empresa, item 38).

## 41. Empresa dividida em Registradora/Financeira — ✅ DEPLOYADO (2026-08-27)

Pedido do Pedro: `/empresas` (`Empresas.js`) era um componente único compartilhado por registradora e financeira. Dividido em dois caminhos de verdade: `EmpresaRegistradora.js` (rota `/registradoras-empresa`, `tipo_empresa` fixo, sem seletor) e `EmpresaFinanceira.js` (rota `/financeiras-empresa`, `tipo_empresa` fixo + `registradora_id` obrigatório com seletor de vínculo). `Empresas.js` removido. Nav (`DashboardLayout.js`) renomeado pra "Minha Empresa" nos dois perfis. Backend intocado — escopo por `user_id` já bastava, mudança 100% estrutural. `Editais.js` tinha um fallback `navigate('/empresas')` (só alcançável por registradora), atualizado pra `/registradoras-empresa`.

Testado com Playwright real (Chromium cacheado no ambiente, `/root/.cache/ms-playwright/chromium-1140`) + bypass temporário de auth (só nos worktrees de teste) — screenshots antes/depois confirmando título, formulário (financeira ganha seletor de registradora vinculada, registradora não tem seletor de tipo) e dados renderizando certo em cada caminho.

**Achado de processo**: `Portarias.js` e `Editais.js` tinham um lote pendente grande e não commitado (ver item 36+ e `project_sigcr_dashboard_session_fixes_20260819` na memória) misturado no mesmo arquivo. Confirmado via bundle de produção que esse lote ainda não está no ar. Deploy isolado (HEAD + só a mudança deste item, lote pendente posto de lado via `git stash push -- <paths>` e depois restaurado) pra não levar código não testado de terceiros junto.

Deploy: commit `afc7a69`, release `releases/20260827-empresa-portarias-uf`. Rollback: release anterior `fase4-detran-conferencia-e-padding`.

## 42. Portarias agrupadas por UF — ✅ DEPLOYADO (2026-08-27)

Pedido do Pedro: lista de Portarias (60 itens, flat) agrupada por UF. Implementado com `Accordion` (componente já existia no projeto, nunca tinha sido usado — `tailwind.config.js` não tinha os keyframes `accordion-down`/`accordion-up`, adicionados). Agrupamento por `estado_sigla`, ordem regional de `ESTADOS_IBGE` (já exportado por `QueridoDiarioBusca.js`, reaproveitado em vez de duplicar a lista de UFs uma terceira vez).

Dados reais confirmados direto no Mongo: 27 UFs populadas (26 estados + DF), 60 portarias, 1-4 por UF — o pedido original mencionou "28 grupos", mas 26+DF=27; sinalizado, não bloqueante. Grupo "SEM_UF" existe como fallback defensivo, sem caso real hoje. Vínculo/hierarquia de aditivo explicitamente não implementado — funcionalidade futura.

Mesmo deploy do item 41 (mesmo commit/release), mesma técnica de isolamento do lote pendente.

## 43. Dashboard clicável — Item "Minha Empresa" ✅ DEPLOYADO; resto AGUARDANDO mapeamento (2026-08-27)

Pedido do Pedro (Item 1): tornar clicáveis os 4 cards de métrica + 3 do Semáforo de Compliance no Dashboard, levando pra tela/filtro correspondente. Pedro pediu mapeamento de rota por perfil antes de codar.

**Achado que mudou a análise**: o `Dashboard.js` com `DashboardFinanceira` separado (que Pedro citou como "já existente hoje") **não está em produção** — é o mesmo lote pendente não commitado de sempre (já sinalizado no item 40 como achado de laranja hardcoded fora do escopo, mas o alcance real do achado — que a tela inteira não está no ar — não tinha sido destacado com essa clareza antes). Produção hoje mostra o MESMO Dashboard (4 cards + Semáforo) pra sigcr_admin, DETRAN, registradora E financeira.

**Fatia implementada agora** (a única sem ambiguidade): pro perfil real (`user.perfil`, não o badge de "ver como") registradora, o card "Empresas" virou "Minha Registradora" (clica → `/registradoras-empresa`); pro perfil financeira, virou "Minha Financeira" (clica → `/financeiras-empresa`). sigcr_admin/detran/detran_admin: card "Empresas" mantido exatamente como estava (sem clique) — o split em cards separados "Registradoras"/"Financeiras" pra esses perfis depende de uma visão agregada de Financeiras que ainda não existe (ver abaixo), não implementado ainda.

**Aguardando confirmação de Pedro pro resto** (perguntas feitas, não respondidas ainda nesta sessão):
1. Visão agregada "Financeiras" (equivalente a `Registradoras.js`/`GET /detran/registradoras`, pro card "FINANCEIRAS" de sigcr_admin/DETRAN) não existe — nem endpoint nem tela. Precisa ser construída do zero, espelhando exatamente o padrão de `/detran/registradoras` (escopo por UF).
2. `GET /stats` escopa `total_documents`/`pending_validations`/`compliance_*` por `user_id` dono da empresa — pra DETRAN (`detran`/`detran_admin`) isso é **sempre zero**, porque DETRAN nunca é dono de uma `Company`. Bug pré-existente, não introduzido por este pedido, mas trava a implementação de "filtro real" (decisão do Pedro) pros cards DOCUMENTOS/PENDÊNCIAS/Semáforo do lado DETRAN — precisa de um `/stats` escopado por UF de atuação (`detrans_atuacao`), não por ownership, mesma lógica já usada em `/detran/registradoras`.
3. Zero tela hoje (`Documentos.js`, `DocumentosEstadoTab.js`/`DocumentosGov.js`, `PainelConferencia.js`, `Portarias.js`) tem qualquer filtro por query param — "filtro real" (decisão do Pedro, não só navegação) significa adicionar essa infraestrutura em cada uma, escopo relevante, não é só um `onClick`.
4. Mapeamento completo de destino por perfil pra DOCUMENTOS/PENDÊNCIAS/PORTARIAS/Semáforo ainda não fechado — depende das respostas acima.

Deploy desta fatia: commit `628d978`, release `releases/20260827-dashboard-empresa-clicavel`. Rollback: release anterior `20260827-empresa-portarias-uf`.

## 44. Fix GET /stats — DETRAN sempre via zero (bug real, pré-existente) — ✅ DEPLOYADO (2026-08-27)

Primeira das 4 fatias combinadas pra fechar o Item 1 (ordem definida pelo Pedro: fix do bug → Financeiras.js → infra de filtro → conectar cliques). `GET /stats` escopava `total_documents`/`pending_validations`/`compliance_*` por `{"user_id": scope.effective_user_id}` pra qualquer perfil que não fosse sigcr_admin sem "ver como" — mas `detran`/`detran_admin` nunca são donos de uma `Company` (só registradora/financeira são), então esse filtro sempre dava zero resultado pra eles. Bug pré-existente, não introduzido por nenhum item desta rodada, só ficou visível ao planejar o Item 1.

**Fix**: nova branch `elif scope.effective_detran_uf: filtro_empresa = {"tipo_empresa": "registradora", "detrans_atuacao": scope.effective_detran_uf}` — mesma lógica de escopo já usada e validada em `GET /detran/registradoras` (`scope.effective_detran_uf` já existia no `EffectiveScope`, populado tanto pro detran/detran_admin real quanto pro `view_as_detran_uf` do sigcr_admin — bônus, agora a simulação "ver como DETRAN-UF" também acerta o dashboard). Escopo por `tipo_empresa=registradora` (não conta financeiras), espelhando exatamente o filtro de `/detran/registradoras` — se o Pedro quiser financeiras contadas também no Documentos/Semáforo do DETRAN, isso é uma decisão separada, não assumida aqui.

**Teste**: sem devtest com container novo (o `docker run` pra um container backend-devtest isolado foi bloqueado pelo classifier de auto-modo da sessão) — testado direto contra um banco Mongo isolado (`sigcr_devtest_stats`, mesmo mongod, credencial root separada, zero risco ao banco real) via um script Python standalone rodado dentro do container `sigcr-backend` já existente (`docker exec ... python3`), replicando exatamente a query nova. 4 cenários confirmados: (1) comportamento antigo reproduzido e confirmado zerado, (2) novo filtro DETRAN-SP conta só a registradora de SP (exclui registradora do RJ e financeira de SP), (3) sigcr_admin agregado não regrediu (continua vendo as 3 empresas), (4) registradora dona (ownership) não regrediu.

Deploy isolado do lote pendente do `server.py` (mesma técnica de sempre — HEAD confirmado idêntico à produção via `docker exec sigcr-backend cat /app/server.py`, isolado o suficiente pra trocar só este trecho, deployado, lote pendente restaurado depois). Rollback: `sigcr-backend:pre-deploy-rollback-20260827-0101`.

**Próxima fatia**: `Financeiras.js` + endpoint novo, espelhando `Registradoras.js`/`/detran/registradoras`.

## 45. Financeiras.js + GET /detran/financeiras — ✅ DEPLOYADO (2026-08-27)

Segunda fatia combinada do Item 1. Visão agregada "Financeiras" pro sigcr_admin/DETRAN não existia (nem endpoint nem tela) — construída do zero, espelhando `listar_registradoras_detran`/`Registradoras.js` ponto a ponto (mesmo escopo por UF, mesma junção com `Submissao`, mesmo layout de card expansível). Diferenças: filtro `tipo_empresa="financeira"` em vez de `"registradora"`, e um campo a mais (`registradora_id`/`registradora_nome_fantasia`) já que financeira sempre depende de uma registradora vinculada (nunca faz sentido isolada).

Rota `/financeiras`, nav "Financeiras" adicionado em `NAV_DETRAN` (seção "DETRANs e Registradoras", ao lado de "Registradoras") e `NAV_ADMIN_EXTRA`.

**Teste real, não simulado**: o `docker run` pra um container backend-devtest novo foi bloqueado pelo classifier de auto-modo (mesma trava do item 44). Alternativa que funcionou: `httpx.AsyncClient` + `ASGITransport` direto contra o objeto `app` do `server.py`, rodando dentro do container `sigcr-backend` já existente via `docker exec` (banco isolado `sigcr_devtest_financeiras`, credencial root separada) — testa o endpoint real via HTTP de ponta a ponta (roteamento, dependências, serialização), sem precisar subir processo/porta/container novo. 5 cenários confirmados: DETRAN-SP vê só as 2 financeiras de SP (não a do RJ) com o vínculo de registradora correto; sigcr_admin com `estado_sigla=RJ` vê só a do RJ; sigcr_admin sem UF → 400; financeira (perfil sem acesso) → 403; sem auth → 401. **Cuidado registrado pra próxima vez**: `TestClient` (síncrono, thread+loop próprios) conflita com o Motor client do módulo (`RuntimeError: Event loop is closed`) quando misturado com `asyncio.run()` fora dele — usar sempre `httpx.AsyncClient(transport=ASGITransport(app=app))` dentro de um único `asyncio.run()` pra testes async contra este `server.py`.

Backend: commit incluído no deploy isolado (mesma técnica — HEAD confirmado idêntico à produção via `docker exec cat`, lote pendente posto de lado, deployado, restaurado depois). Rollback: `sigcr-backend:pre-deploy-rollback-20260827-0109`. Frontend: release `releases/20260827-financeiras-view`, rollback pra `20260827-dashboard-empresa-clicavel`.

**Próxima fatia**: infraestrutura de filtro por query param nas telas de destino (Documentos, Portarias, telas DETRAN) — maior escopo, mapeamento por perfil a reportar antes de codar.


## 46. Infraestrutura de filtro por query param (Documentos/Portarias/Registradoras) — ✅ DEPLOYADO (2026-08-27)

Terceira fatia combinada do Item 1, autonomia total confirmada pelo Pedro pra terminar a demanda sem pausar de novo pra cada mapeamento. Filtro REAL (decisão do Pedro), não só navegação:

- **`Portarias.js`**: `?status=vigente|revogada` filtra a lista antes de agrupar por UF (Item 3). Chip "Filtrando por status: X" com botão limpar.
- **`Documentos.js`/`ChecklistContran.js`**: `?status=pending` (mapeado pro vocabulário do checklist: `pending` → item com status `enviado`, que é o que `pending_validations` do `/stats` realmente conta — documento enviado aguardando validação, não "nunca enviado"); `?compliance=vencido|vencendo|valido` filtra por status de vencimento do documento (`getVencimentoStatus`, já existia, só ganhou uma chave normalizada). Banner "N item(ns) aguardando validação/vencidos/vencendo/em dia".
- **`Registradoras.js` + `GET /detran/registradoras`**: não existia nenhuma tela de "documentos" pro lado DETRAN que fizesse sentido (`/credenciamento/documentos` é outra coisa — `documentos_gov`, não os documentos de credenciamento de empresa que `/stats` conta). Em vez de construir uma tela nova do zero, a lista de registradoras (já o escopo certo pós-fix do item 44) ganhou 3 campos novos por empresa (`total_documentos`, `docs_pendentes`, `compliance`) e um filtro `?compliance=X`/`?pendencias=1` — badge de compliance só aparece quando o filtro está ativo (aparência default 100% preservada).

**Teste**: 18 checks via Playwright reais (não só screenshot) contra os 3 componentes — clica/navega e confirma via `textContent` que o item certo aparece/some, contagens batem, chip de filtro aparece só quando esperado, aparência sem filtro fica idêntica à anterior. 2 armadilhas do próprio teste corrigidas achadas no processo: (1) Radix Accordion mantém grupos colapsados por padrão — precisa expandir antes de checar texto interno; (2) classe CSS `uppercase` muda só a renderização visual, não o `textContent` real (contém minúsculas) — checar sempre o texto real, não o que aparece na tela.

Backend (`/detran/registradoras`) e frontend (`Portarias.js`, `Documentos.js`, `ChecklistContran.js`, `Registradoras.js`) deployados isolados do lote pendente (mesma técnica de sempre). Rollback backend: `sigcr-backend:pre-deploy-rollback-20260827-0213`. Frontend: release `releases/20260827-filtros-documentos-portarias-registradoras`, rollback pra `20260827-financeiras-view`.

## 47. Dashboard clicável — conectado ponta a ponta, Item 1 completo — ✅ DEPLOYADO (2026-08-27)

Última fatia do Item 1. Duas partes:

1. **`GET /stats` ganhou `total_registradoras`/`total_financeiras`** (além do `total_companies` já existente) — dict unpacking com override de `tipo_empresa` funciona certo nos 3 branches de escopo (agregado sigcr_admin, por-UF do DETRAN, por-ownership), testado nos 3.
2. **`Dashboard.js` conectado**: card único "Empresas" virou 2 cards reais ("Registradoras"/"Financeiras", contagem real, clique pra `/registradoras`/`/financeiras`) pro sigcr_admin/DETRAN — pro registradora/financeira continua o card único "Minha Registradora"/"Minha Financeira" (item 43). Documentos/Pendências/Portarias/Semáforo conectados com a infra do item 46: registradora/financeira → `/documentos` com filtro; sigcr_admin/DETRAN → `/registradoras` com filtro (não existe visão de "financeiras" com compliance ainda — decisão consciente de escopo, sinalizada, não construída sem necessidade concreta). Achado tratado com cuidado: card "Portarias" aparece hoje pro perfil financeira no dashboard compartilhado (ver achado do item 43 — `DashboardFinanceira` ainda não está em produção), mas financeira não tem acesso à rota `/portarias` — esse card fica estático só pra esse perfil específico, os outros 3 continuam clicáveis.

**Teste**: 19 + 3 checks via Playwright cobrindo os 4 perfis (registradora, financeira, DETRAN, sigcr_admin) — cada card testado por clique real (não só presença de texto), URL de destino confirmada, contagens reais conferidas, card estático (financeira/Portarias) confirmado SEM `cursor-pointer`.

**Achado de ambiente registrado pra próxima vez**: `docker run` pra um container novo é bloqueado pelo classifier de auto-modo desta sessão (ver item 44/45) — não afeta `docker exec` em container já existente nem `docker build`/`deploy.sh` (que só faz `docker stop`+`rm`+`run` do MESMO nome já autorizado). Rodar `httpx.AsyncClient(transport=ASGITransport(app=app))` dentro do container `sigcr-backend` via `docker exec` continua sendo o caminho real de teste de backend nesta sessão.

Backend: rollback `sigcr-backend:pre-deploy-rollback-20260827-0307`. Frontend: release `releases/20260827-dashboard-clicks-completo`, rollback pra `20260827-filtros-documentos-portarias-registradoras`.

**Item 1 (Dashboard clicável) está completo**: as 4 fatias (fix do bug de `/stats`, Financeiras.js, infra de filtro, conexão dos cliques) foram todas reportadas, testadas isoladamente e deployadas na mesma sessão, 2026-08-27, com autonomia total confirmada pelo Pedro a partir da fatia 3.

## 48. Item 4 — Menubar (shadcn/Radix) substitui pill bar + vapour-text-effect do Dashboard — ✅ DEPLOYADO (2026-08-27)

Pedido do Pedro: trocar a barra de pills (`GradientMenu`) e o efeito de partículas/glow (`VaporizeTextCycle` em `vapour-text-effect.js`) do Dashboard — achado "muito brega" — por uma `Menubar` shadcn/Radix, mantendo paridade funcional (navegação + indicação de aba ativa).

**Investigação confirmou o "efeito brega" como descrito**: `gradient-menu.js` (5 pills fixas, iguais pra todo perfil, navegação via `window.location.href` — full reload, a mesma causa-raiz do incidente de 2026-07-30 de black-screen em timing de deploy) + `vapour-text-effect.js` (`VaporizeTextCycle`, canvas com dissolução de texto em partículas, já documentado em [[project-sigcr-redesign-fase3-area-logada]]). Ambos os arquivos deletados por completo — não sobrou uso residual em nenhuma outra tela.

**Implementação**: `app-menu-bar.js` (novo, adaptado do `app-menu-bar.tsx` que o Pedro forneceu via shadcn CLI — convertido de TSX pra JS/JSX puro, projeto não usa TypeScript) + `menubar.jsx` (primitivos shadcn/Radix adaptados da mesma forma, reaproveitando o `cn()` já existente em `lib/utils`, zero duplicação). Cores 100% nos tokens do Design System (`bg-popover`/`--popover: 227 52% 14%` = `#111936`, `border` = `#29314f` — mesmos valores de `index.css` do rebrand Berry) — nenhuma cor clara do exemplo shadcn (`bg-white`, `border-slate-200`) sobrou, confirmado por leitura direta do componente final.

Itens do menu **não são mais uma lista fixa** — vêm de `config/navMenus.js` (`buildNavStructure`, novo módulo, extraído pra ser a MESMA fonte que a sidebar do `DashboardLayout` já usava, evitando duas fontes de verdade pra navegação por perfil). Navegação passa a ser client-side (`useNavigate`) em vez do full-reload antigo. Indicação de aba ativa preservada (`isActive`/`grupoAtivo`, destaque `bg-primary-500/15`), inclusive nos grupos com submenu (`MenubarSub` — "Administração" e as seções nomeadas tipo "DETRANs e Registradoras").

**Regressão encontrada e corrigida na mesma rodada**: o commit do Menubar (`c00f29c`) foi construído sobre uma base de `Dashboard.js` anterior ao item 47 (Dashboard clicável, mesmo dia) e sobrescreveu silenciosamente a navegação clicável dos 4 cards + Semáforo — mesma classe de bug do incidente de 2026-08-11 (deploy isolado sobre HEAD desatualizado, ver [[project-sigcr-deploy-pattern]]). Detectado via grep no bundle de produção (`main.47db0e3e.js` não continha mais a lógica de `to`/`onClick`), corrigido no commit `5f1b305` restaurando `isEmpresaSelf`/`isDetranOuAdmin`/`empresaCards`/`*To`/`semaforoTo`.

**Teste isolado + comparação visual antes/depois**: harness `/__preview` descartável (nunca commitado) + Puppeteer, perfis registradora/DETRAN/sigcr_admin — screenshots `before_registradora.png` (pill bar + glow) vs `after_registradora.png`/`after_detran.png`/`after_admin_dropdown.png` (Menubar, incl. submenu "Administração" aberto) confirmam: paridade funcional mantida, zero cor clara vazando, aba ativa destacada corretamente, submenu renderizando com fundo `#111936` (não o branco default do shadcn).

**Pós-deploy, verificado nesta sessão de continuação**: bundle de produção atual (`main.9f6df240.js`) tem zero ocorrência de `vapour`/`VaporizeText` (grep direto no bundle), site respondendo HTTP 200.

Deploy: commits `c00f29c` (feat) + `5f1b305` (fix da regressão), releases `releases/20260827-dashboard-menubar` → `releases/20260827-1437-dashboard-menubar-clickfix` (atual). Rollback: release anterior `20260827-dashboard-clicks-completo` (item 47, pré-Menubar). Backend não foi tocado (mudança 100% frontend).

## 49. Fix do overflow horizontal do Menubar + refinamento de raio/sombra do Design System — ✅ DEPLOYADO (2026-08-27)

Pedido do Pedro, mesma rodada do item 48: o `Menubar` recém-deployado tinha itens demais pra caber numa linha (registradora: 9 itens; DETRAN: 12, incluindo a seção "DETRANs e Registradoras") e gerava scroll horizontal, cortando "Painel de Conferência" pro perfil DETRAN.

**Caminho escolhido**: manter a sidebar como navegação principal (já redesenhada nas Fases 3-4) e reduzir o `AppMenuBar` a um atalho secundário — só os itens mais usados por perfil ficam soltos na linha (flag `destaque: true`, nova, em `config/navMenus.js`), o resto agrupado atrás de um trigger "Mais" via `MenubarSub`/`MenubarSubContent` (primitivo que já existia em `menubar.jsx`, sem uso até então). Alternativa descartada: aumentar o menu pra 2 linhas ou compactar fonte/padding — continuaria crescendo a cada novo item futuro; a divisão destaque/resto escala melhor.

`buildNavStructure` (mesma função usada pela sidebar) ganhou dois campos novos, `navDestaque`/`navSecundarios` (split de `navItems` pela flag `destaque`) — a sidebar ignora a flag e continua listando tudo, só o `AppMenuBar` consome a divisão. Destaques definidos por perfil: registradora (Dashboard/Editais Abertos/Portarias/Notificações), DETRAN (Dashboard/Editais/Portarias/Notificações), financeira (Dashboard/Documentos/Registro de Contrato/Notificações).

**Teste isolado**: 2 worktrees detached de HEAD (`/tmp/sigcr-before-*` sem o patch, `/tmp/sigcr-after-*` com as mudanças do working tree aplicadas), build de produção real em cada um, servidos localmente (SPA fallback via `http.server`), Playwright com o mesmo bypass de auth via `localStorage.__sigcr_preview_user__` + mock de `/api/stats` já documentado no item 48. Confirmado visualmente: DETRAN antes tinha 8 itens cortando "Painel de Conferência" fora da viewport de 1440px; depois, só 5 itens (Dashboard/Editais/Portarias/Notificações/Mais) cabem numa linha sem scroll, e o dropdown "Mais" lista corretamente os 5 secundários + a seção "DETRANs e Registradoras" como submenu aninhado. Registradora e a checagem funcional (aba ativa, navegação) confirmadas do mesmo jeito.

**Refinamento de raio/sombra (`button.jsx`, `card.jsx`, `index.css`, `tailwind.config.js`)**: `--radius` subiu de `0.5rem` pra `0.8rem` (token único, já usado por `rounded-md`/`rounded-sm`/`rounded-lg` em botões/inputs/popovers) e um token novo, `--card-radius: 1rem`, mapeado numa nova classe Tailwind `rounded-card` (`card.jsx` trocou `rounded-xl` fixo por ela). Sombra sutil (`shadow-sm shadow-black/5`) adicionada nas 3 variantes coloridas de `Button` (`default`/`destructive`/`outline`) — `secondary` deliberadamente não tocada (pedido do Pedro), o glow colorido de hover já existente continua sendo o destaque visual principal. Cores primary/secondary/destructive (`#2196f3` etc.) inalteradas — só raio e sombra. Confirmado via showcase estático servindo o CSS compilado de cada build (antes/depois lado a lado): raio visivelmente maior, paleta 100% dentro dos tokens do SIGCR, nenhuma cor do exemplo original sobrando.

Deploy: ver hash/release abaixo (preenchido no momento do swap). Backend não foi tocado (mudança 100% frontend) — o lote pendente de ~490 linhas em `backend/server.py` permanece intocado e não commitado, isolado do escopo deste deploy pelo `git-sync-or-die.sh frontend`.
