# SIGCR Design System V2 — auditoria e especificação

Estado: fundação isolada, ainda não adotada por telas produtivas.

## Inventário de telas produtivas

| Tela / rota | Perfil | Estrutura e conteúdo | Achados visuais principais |
|---|---|---|---|
| Landing `/` | público | marketing, seções e CTAs | linguagem promocional, cards e gradientes; fora do AppShell |
| Planos `/planos` | público | comparação/checkout | 35 estilos inline; cards de oferta e cores decorativas |
| Cadastro `/cadastro` | público | formulário | formulário próprio, sem composição compartilhada |
| Checkout `/checkout` | público | formulário/pagamento | 74 estilos inline; layout próprio |
| Pagamento aguardando `/pagamento/aguardando` | público | status/instruções | 28 estilos inline; estado visual ad hoc |
| App mobile `/app-mobile` | público | apresentação/download | 46 estilos inline; aparência promocional |
| Upload `/documentos/upload` | público | formulário/upload | 32 estilos inline; dropzone próprio |
| Selo `/selo/:companyId` | público | detalhe institucional | cartão de validação próprio |
| Transparência `/transparencia[/:uf]` | público | consulta/listagem | filtros e resultados fora do padrão administrativo |
| Dashboard `/dashboard` | autenticado, todos | KPIs, atalhos e blocos | 22 ocorrências de card; bento/glow; baixa densidade operacional |
| Minha empresa `/registradoras-empresa` | registradora | detalhe, formulário, documentos | muitos painéis e estados locais; composição extensa |
| Minha empresa `/financeiras-empresa` | financeira | detalhe, formulário, documentos | duplicação visual da versão registradora |
| Portarias `/portarias` | empresa/DETRAN | abas, filtros, listagens, 19 diálogos | arquivo de 1.161 linhas; alta complexidade e duplicação; candidata piloto |
| Documentos `/documentos` | empresa | lista/upload | layout autenticado; composição simples, porém específica |
| Registro `/registro-contrato` | financeira | formulário/workflow | formulário extenso sem FormSection/FormGrid comuns |
| Fila `/fila-registros` | registradora | filtros/lista operacional | boa candidata futura a DataTable |
| Credenciamento `/credenciamento-portaria` | empresa | listagem/workflow | 440 linhas; estados e ações dispersos |
| Conferência `/detran/conferencia` | admin/DETRAN | fila, filtros e decisão | fluxo operacional com controles próprios |
| Dossiê `/credenciamento/documentos` | DETRAN | wrapper de documentos | reutiliza Documentos, pouco risco visual |
| Estados `/estados` | DETRAN | lista/navegação | cards em lugar de tabela/lista densa |
| Estado `/estados/:sigla` | DETRAN | detalhe, métricas, 13 tabelas | 759 linhas; múltiplos padrões de tabela |
| Registradoras `/registradoras` | admin/DETRAN | filtros/lista | listagem operacional com composição própria |
| Financeiras `/financeiras` | admin/DETRAN | filtros/lista | duplicação estrutural de Registradoras |
| Mapa `/mapa` e `/mapa-nacional` | DETRAN/público | mapa e painéis | 33 estilos inline; dependência visual específica do mapa |
| Solicitações `/solicitacoes` | registradora/DETRAN | lista | shell padrão, lista curta; poucos primitives compostos |
| Solicitação `/solicitacoes/:id` | registradora/DETRAN | detalhe/workflow | 369 linhas; estados, ações e seções locais |
| Notificações `/notificacoes` | autenticado | lista | estados lido/não lido próprios |
| Criar evento `/criar-evento` | DETRAN | formulário | 310 linhas; seções e validação sem composição comum |
| Esteiras `/esteiras` | autenticado | visualização de fluxo | 73 estilos inline e oito gradientes; fora do DashboardLayout |
| Usuários `/usuarios` | admin | filtros, formulário, 17 tabelas/diálogos | 531 linhas; alta densidade com estilos locais |
| Configurações `/configuracoes` | admin | alias de Gestão de Usuários | mesma tela para duas rotas; sem identidade própria |

`Login.js` e `PortariaPublica.js` existem, mas não estão montados diretamente em `App.js`; devem ser tratados como legado/candidatos a remoção somente após confirmação funcional. `/editais` é redirect deliberado, não uma tela.

## Diagnóstico quantitativo

- 365 blocos `style={{...}}` nas páginas.
- 137 ocorrências de classes de gradiente (`gradient`, `from-*`, `to-*`).
- 36 ocorrências de glow, blur amplo ou backdrop blur.
- 16 ocorrências explícitas de `rounded-xl`, `rounded-2xl` ou `rounded-3xl`.
- 24 usos de tracking largo/extralargo.
- 45 classes de sombra e 187 usos de `Card`.
- 71 ocorrências de estruturas de tabela, 71 badges, 98 diálogos/alert dialogs.
- 107 inputs, 158 selects e 23 tabs, frequentemente combinados por página em vez de por padrões de formulário/toolbar.

Os sinais mais fortes de “UI de IA” são a combinação de gradiente + glow, cards como estrutura universal, ícones em bolhas, backgrounds semânticos usados como decoração, grandes arquivos JSX e estilos inline. O problema não é um primitive isolado: é a ausência de composições oficiais de página, tabela, filtro, formulário e estado.

## Design system atual

### O que existe

- Fontes: Inter (interface), Barlow Condensed (títulos), JetBrains Mono (dados/códigos).
- Tema escuro único: `background #1a223f`, `card #111936`, níveis `#212946/#29314f`.
- Marca: azul `#2196f3`; secundária roxa `#7c4dff`.
- Semânticas disponíveis: verde, âmbar e vermelho em escalas 50–950.
- Radius: `--radius: .8rem`, `--card-radius: 1rem`.
- Primitives Radix/shadcn: Button, Card, Badge, Input, Select, Table, Dialog, Tabs e demais controles.
- Shell autenticado: `DashboardLayout`; menu centralizado em `navMenus.js`.
- Elevação extra global: `.elevate-2`, `.elevate-3`; decoração `.glow-brand`.

### Conflitos e lacunas

- `Button` default e secondary impõem gradientes e glow, contrários à direção V2.
- `Dialog` usa blur/glow; Card aplica sombra por padrão.
- Azul aparece também como `blue-*`, concorrendo com `primary-*`.
- Não há escala documentada de spacing, elevação, largura ou densidade.
- Breadcrumb existe, mas não é usado pelas telas.
- Table é primitive, não DataTable; faltam toolbar, paginação e responsividade oficial.
- Não há PageContainer, PageHeader, MetadataList, DescriptionList, FormSection, EmptyState ou ErrorState compartilhados.
- Muitos primitives instalados estão sem uso produtivo; não devem ser removidos nesta fase.

### Preservar

Preservar Radix como base acessível, os primitives Input/Select/Table/Tabs, Inter e JetBrains Mono, as escalas semânticas, `navMenus.js`, contextos e contratos funcionais. Button, Badge, Card, Dialog e DashboardLayout devem ser evoluídos de forma compatível, não reescritos em massa.

### Substituir gradualmente

Substituir composições locais de header/filtro/tabela/status; estilos inline; cards decorativos; variantes com gradiente/glow; selects HTML estilizados isoladamente; estados vazios/loading/erro específicos por tela. “Substituir” significa migrar consumidor por consumidor e só remover legado após busca e testes.

## Foundations V2

### Cores

- `canvas`: fundo sólido neutro escuro; `surface`: conteúdo; `surface-raised`: menus/modais.
- `border-subtle` e `border-strong`: estrutura, nunca decoração.
- `action-primary`: azul institucional; `action-secondary`: controle neutro. Roxo deixa de ser ação rotineira.
- Semânticas: `success`, `warning`, `error`, `info`, `pending`, `neutral`, `revoked`, `approved`, `analysis`, `diligence`.
- Status do domínio deve ser traduzido para `tone`; a biblioteca não conhece strings da API.

### Tipografia e densidade

- Inter: corpo e controles. JetBrains Mono: IDs, placas, protocolos e números tabulares.
- Barlow Condensed somente para títulos institucionais, sem caixa alta compulsória.
- Escala: 12 (auxiliar), 14 (padrão denso), 16 (ênfase), 20/24/30 (títulos).
- Linha de tabela padrão: 44 px; compacta: 36 px. Controle padrão: 36 px; confortável: 40 px.

### Espaçamento, radius, bordas e sombras

- Escala base: 4, 8, 12, 16, 24, 32, 48 px.
- Radius: 4 px (células/tags), 6 px (controles), 8 px (painéis), 12 px apenas para superfícies especiais.
- Borda padrão de 1 px. Divisores preferidos a caixas aninhadas.
- Sem sombra em controles/cards comuns; sombra discreta apenas em overlays e elementos realmente elevados.
- Ícones: 16 px em controles/tabelas, 20 px em navegação, 24 px em estados; stroke consistente.

### Containers e breakpoints

- Página autenticada: largura máxima `screen-2xl`, padding 16/24/32 px.
- Texto longo: máximo aproximado de 72 caracteres; formulários: 768–960 px quando não exigirem grade ampla.
- Breakpoints seguem Tailwind (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`).
- Desktop prioriza densidade; mobile empilha ações, torna toolbars quebráveis e tabelas horizontalmente roláveis ou em lista deliberada.

## Layout e componentes

- `AppShell`: sidebar fixa no desktop, drawer no mobile, fundo sólido.
- `Sidebar`: navegação por tarefa, ativo por borda/fundo discreto, sem glow.
- `Topbar`: identidade da visão ativa, notificações e usuário; sem duplicar navegação principal.
- `Breadcrumb`: sempre acima do header em níveis internos.
- `PageContainer`: limite/padding único. `PageHeader`: título, descrição e ações.
- `DataTable`: Table + ordenação + seleção + estado vazio/loading; sem esconder colunas críticas silenciosamente.
- `TableToolbar`: busca, filtros e ações secundárias; filtros ativos removíveis.
- `Pagination`: total, faixa exibida, anterior/próxima e tamanho de página quando necessário.
- `MetadataList`/`DescriptionList`: detalhes chave–valor sem criar um card por campo.
- `FormSection`, `FormGrid`, `FormField`: agrupamento semântico, labels/ajuda/erro previsíveis.
- Inputs, Select, Textarea e Date herdam altura/foco/disabled; UploadField explicita formatos, limite e progresso.
- Alert/Toast/Dialog/ConfirmDialog distinguem persistência e gravidade. Confirmação destrutiva exige verbo e objeto claros.
- Empty/Error/Loading/Skeleton preservam o espaço e informam próxima ação.
- Tabs e SecondaryNav só representam visões irmãs; Breadcrumb representa hierarquia.

## Padrão oficial de página

Ordem: Breadcrumb → PageHeader (título, descrição curta, ação primária) → Toolbar (busca, filtros, ações secundárias) → conteúdo operacional → paginação.

1. Listagem: toolbar e DataTable; filtros persistem na URL quando isso já for suportado.
2. Detalhe: header com status/ações, DescriptionList e seções; histórico em tabela/timeline.
3. Formulário: largura contida, FormSections, ações estáveis no fim; validação junto ao campo.
4. Dashboard: KPIs compactos, pendências e atividade; sem mosaico decorativo.
5. Workflow: contexto/status no header, stepper linear, conteúdo e ações explícitas; não codificar permissão no visual.

## Dashboard V2 (especificação, não implementação)

Usar 4–5 KPIs com período/fonte, pendências priorizadas, vencimentos, atividade recente, distribuição por UF quando relevante e atalhos por frequência. Uma informação aparece uma vez. Gráficos só quando apoiam comparação/decisão; sem animação, glow ou cartão puramente ornamental.

## Tela piloto recomendada

`/portarias` (AreaTransparencia) é a melhor piloto: reúne perfis distintos, abas, busca/filtros, status, listagens, ações e muitos diálogos, além de responsividade real. É complexa o suficiente para validar os contratos sem começar pelo Dashboard, cuja natureza executiva poderia mascarar problemas de tabela/formulário. A piloto deve preservar integralmente permissões, queries, estados e ações.

## Estratégia de migração

1. Fundação: validar tokens semânticos e composições isoladas; adicionar catálogo local/testes.
2. AppShell: migrar layout sem tocar regras de menu/perfil/ViewContext.
3. Tela piloto: portar `/portarias` incrementalmente, com comparação visual e testes de permissão/fluxo.
4. Migração operacional: famílias duplicadas (Registradoras/Financeiras; empresas; filas; detalhes).
5. Dashboard: reconstruir após os padrões operacionais estarem maduros.
6. Cleanup: remover estilos/componentes legados somente com zero consumidores confirmado.

## Riscos e guardrails

- Classes Tailwind construídas dinamicamente podem não entrar no bundle; mantenha mapas estáticos.
- Alterar primitives globais muda dezenas de telas: criar variantes V2 e migrar antes de trocar defaults.
- Radix Portal exige teste de foco/teclado; tabelas precisam teste em viewport estreito.
- Perfil ativo e “ver como” são contexto de segurança percebida: preservar sinalização e contratos.
- Cores não podem ser a única pista de status; sempre há texto.
- Não confundir melhoria visual com mudança de ordenação, filtro, ação ou visibilidade.
