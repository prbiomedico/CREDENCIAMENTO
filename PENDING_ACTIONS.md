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

### Pendente: confirmação antes do deploy, como combinado.


