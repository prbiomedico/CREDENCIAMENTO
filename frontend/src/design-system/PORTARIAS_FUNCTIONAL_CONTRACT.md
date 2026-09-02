# Contrato funcional congelado — `/portarias`

Referência anterior ao redesign: `AreaTransparencia.js` em `6ad9881`.

## Invariantes

- A aba vem de `?aba=editais`; qualquer outro valor abre Portarias. Trocar aba preserva os demais parâmetros.
- `?status=` filtra Portarias no cliente; limpar remove somente esse parâmetro.
- `?portaria_id=` abre a UF correspondente, rola e destaca o registro.
- A montagem autenticada carrega `GET /api/portarias` com credenciais e `GET /api/editais`.
- Busca vazia recarrega todas as portarias; busca preenchida usa `GET /api/portarias/search?q=...` com credenciais.
- Análise usa `POST /api/portarias/analyze`, payload `{ text }`, preservando loading, resultado e toasts.
- PDF HTTP abre nova aba com `noopener,noreferrer`; path interno usa `GET /api/portarias/{id}/pdf`, blob autenticado e download local.
- Credenciamento usa `POST /api/submissoes`, sem body, query `portaria_id`, e navega para `/credenciamento-portaria?submissao_id=...`.
- Edição de portaria mantém todos os campos, catálogo/checklist, `PATCH /api/portarias/{id}` e refresh.
- Upload de PDF mantém multipart em `POST /api/portarias/{id}/pdf`.
- Portaria publicada é revogada após confirmação via PATCH de `{ status: 'revogada' }`; rascunho é excluído após confirmação via DELETE. HTTP 409 mantém mensagem específica.
- Copiar link público continua condicionado a `link_publico && publicado_at`.
- `podeGerenciar`: perfil real `sigcr_admin`, `detran` ou `detran_admin`, exceto simulação como empresa.
- `podeCredenciar`: simulação como empresa ou perfil real registradora/financeira sem simulação.
- Criar/editar portaria ou edital continua condicionado a `podeGerenciar`; credenciar/candidatar continua fora desse grupo.
- Portaria sem PDF mantém credenciamento desabilitado.
- Querido Diário preserva callback de promoção apenas para gestores e navega ao wizard com os mesmos parâmetros.
- Editais continuam filtrados localmente apenas por UF.
- Candidatura usa `POST /api/solicitacoes` com `edital_id`, `company_id` e `uf`; uma empresa envia diretamente, múltiplas abrem o seletor.
- Empresas são obtidas por `GET /api/companies`; ausência navega para `/registradoras-empresa`.
- Novo/editar edital preserva validação de título/UF, POST/PATCH, uploads, documentos obrigatórios, anexos e termo.
- Loading, empty states e mensagens de erro continuam independentes por aba.
- Diálogos continuam Radix controlados, preservando foco, Escape e tab order.
- Em viewport estreito, conteúdo operacional usa overflow horizontal; ações não são removidas.
