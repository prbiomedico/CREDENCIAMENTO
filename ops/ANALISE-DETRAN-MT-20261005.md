# DETRAN-MT: análise do credenciamento e melhorias do SIGCR

Data: 05/10/2026. Inspeção pela sessão do usuário no Google Chrome, perfil de empresa. Processo existente 2745/2026, credenciamento inicial de registradora, exibido como Aprovado.

## Telas conferidas

| Tela | Processo observado | Aplicação no SIGCR |
| --- | --- | --- |
| Consulta | Número/ano, serviço, finalidade inicial, empresa, data de criação e situação; filtros por número e situação | Tornar a identificação do processo e as situações fáceis de consultar |
| Novo processo | Escolha entre inicial e renovação; seleção de serviço antes dos dados | Preservar categoria e finalidade em cada submissão |
| Dados da empresa | Identificação, endereço e contato; campos desabilitados na consulta aprovada | Revisão da empresa no resumo anterior ao envio |
| Documentos da empresa | Requisitos agrupados por assunto, texto explicativo, um anexo em cada exigência, tipo/tamanho do arquivo e validade quando aplicável | Agrupamento, busca, filtros, progresso e acesso aos anexos |
| Sócios | Lista de pessoas com situação individual e ação Visualizar | Evolução futura: cadastro próprio de pessoas e vínculo com o processo |
| Ficha do sócio | Identificação, endereço, contato e documentos pessoais | Exigir isolamento por empresa, permissões e versões dos anexos antes de implementar |
| Funcionários | Lista individual com situação e ficha própria | Separar documentação da equipe da documentação da pessoa jurídica |
| Ficha do funcionário | Dados pessoais e documentação da relação de operadores | Diferenciar pessoa, função e comprovação de vínculo |
| Confirmação | Serviço, protocolo e resumo dos dados; ação de retorno à consulta no processo aprovado | Revisão explícita antes da transmissão no SIGCR |
| Orientações | Checklist pelo portal; cadastro de operadores DETRANNET pelo SIGADOC; responsabilidade, documento com foto e comprovação de vínculo | Informar que o cadastro de operadores tem um protocolo próprio em MT |
| Renovação | Seleção de serviços; Registradora não apareceu nas opções desta sessão | Não presumir disponibilidade ou bloquear renovação no SIGCR com base nesta observação |

Não foram criados processos, enviados arquivos ou alterados cadastros no DETRAN-MT. A inspeção cobriu as telas acessíveis de consulta e as seleções iniciais. Não cobriu as telas internas dos analistas do DETRAN, o envio de um novo requerimento nem uma renovação de registradora: essas etapas não estavam disponíveis no processo consultado.

## Melhorias implementadas

- Checklist organizado por assunto, preservando IDs, documentos, quantidade de exigências e estados de análise. O agrupamento usa o nome da exigência para facilitar navegação; não é uma classificação normativa oficial.
- Pesquisa sem dependência de acentos e filtros por pendente, enviado, conforme e inconforme.
- Progresso documental que separa exigências com anexo, documentos conformes e diligências. Arquivo anexado não equivale a aprovação.
- Download do anexo de cada exigência pela rota autenticada existente.
- Resumo de empresa, CNPJ, UF, categoria, portaria, finalidade e quantidade de anexos antes do envio para análise.
- Revisar abre apenas o resumo. A transmissão ocorre somente na ação Enviar para análise.
- Orientação contextual de MT sobre cadastro de operadores pelo SIGADOC.
- Formato e limite de upload explicados conforme o backend atual do SIGCR: PDF/imagens permitidas, até 20 MB. O limite de 5 MB observado em fichas do portal MT não foi imposto a outros estados.
- Correção de seleção de submissão no upload: agora considera a categoria ativa. Antes o formulário buscava a portaria sem a categoria, podendo não localizar o processo em empresas com várias categorias.
- Contagem da lista de portarias passa a considerar os itens da categoria exibida.
- Correção de contraste dos títulos das exigências no tema claro.

## Evoluções propostas após esta entrega

1. Cadastro de sócios, representantes e operadores com vínculo à empresa e ao processo, permissões específicas para dados pessoais, documentos por pessoa, histórico e status individual. O SIGCR possui um modelo de representante legal; isso não equivale à gestão completa de pessoas observada em MT.
2. Cadastro estruturado de orientações, modelos, canal de protocolo e referências legais por UF/categoria, administrado pelo perfil autorizado.
3. Grupos de checklist configurados na portaria, substituindo a organização inferida pelo nome.
4. Resumo de protocolo externo, taxas, homologação, termo e liberação operacional com evidência própria para cada etapa; manter as etapas já existentes no fluxo V2 e evitar duplicá-las.
5. Políticas de renovação por norma e categoria, incluindo calendário fixo quando aplicável, depois de validação das fontes e compatibilidade com ciclos já cadastrados.

## Cuidados identificados na referência

- A consulta apresenta o CNPJ no campo de razão social: não reproduzir essa inconsistência no SIGCR.
- Um anexo de regularidade social/FGTS tem nome que menciona débitos trabalhistas. O nome do arquivo não comprova seu conteúdo; manter a conferência documental.
- Certidões do processo aprovado podem apresentar datas de validade antigas. A consulta histórica deve preservar a documentação usada, sem presumir vigência atual nem revogar aprovação automaticamente.
- A página pública de renovação de registradoras e a seleção visível de serviços diferem nesta sessão. A causa não foi determinada.

## Fontes

- Portal observado: https://portalcredenciamento.detran.mt.gov.br/
- Modelos oficiais: https://www.detran.mt.gov.br/modelos14
- Orientações públicas de renovação: https://www.detran.mt.gov.br/renova%C3%A7%C3%A3o

## Verificação

Testes automatizados incluem preservação dos itens ao agrupar e filtrar, distinção entre anexo e conformidade, bloqueio da revisão para lista vazia/sem arquivo, revisão sem envio automático e consulta somente leitura. Resultado e publicação registrados ao final da entrega.

Resultado: 43 testes passaram; build de produção concluído. Publicação realizada pelo script oficial em release `credenciamento-mt-20261005`, commit `289ce21`. Página, novo bundle JavaScript e API responderam HTTP 200 após a troca da release.

A sessão do SIGCR disponível ao agente estava deslogada. A interação da melhoria foi verificada por testes de renderização e clique; a conferência visual no painel autenticado de produção ainda depende de uma sessão ativa. O build registra seis vulnerabilidades altas nas dependências e alerta de tamanho do bundle; a correção de dependências permanece no backlog da auditoria anterior.
