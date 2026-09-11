# Estado operacional do SIGCR

Documento sanitizado e versionável. Não registrar aqui senhas, tokens, IPs
privados, dumps de banco ou conteúdo de `.env`.

## Gates obrigatórios

- Testes backend com MongoDB isolado.
- Build frontend e E2E desktop/mobile.
- Audit de dependências executadas em produção sem alertas altos ou críticos.
- Backup dos arquivos e configurações substituídos.
- Publicação exclusivamente pelos scripts oficiais.
- Smoke de frontend, API, OIDC, Keycloak, MongoDB e ClamAV.
- Imagem/release anterior identificada para rollback.

## Administração

Gestão de Usuários inclui criação, edição de identidade/perfil/UF, mudança de
status, redefinição de senha, encerramento e visualização de sessões, histórico
individual, exportação CSV e exigência de MFA no próximo acesso. Operações
sensíveis devem gerar auditoria e encerrar sessões quando aplicável.

## Arquivos locais de handoff

`CONTEXT_HANDOFF_SIGCR.md` é deliberadamente local e ignorado pelo Git. Antes de
copiar qualquer conteúdo para este documento, remova credenciais e detalhes de
infraestrutura que não sejam necessários para operar o sistema.
