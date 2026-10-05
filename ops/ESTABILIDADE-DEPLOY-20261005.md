# Estabilidade das abas durante atualizações do SIGCR

Em 05/10/2026 foi reproduzida uma falha no tratamento de recursos de versões anteriores: URLs reais de JavaScript e CSS da release anterior retornavam HTTP 200 com HTML da página inicial. Isso pode causar erro de carregamento em abas abertas antes da atualização. A reprodução não determina que todos os incidentes relatados pelo usuário tenham essa mesma causa.

Correção aplicada:
- Arquivos das releases existentes preservados em diretório compartilhado, sem alterar seu conteúdo.
- Script oficial de deploy preserva os recursos da nova release antes de trocar a versão publicada.
- Nginx serve `/assets/` e `/static/` pelo diretório compartilhado, com cache de recursos e resposta 404 para arquivos inexistentes.
- Página inicial mantém política sem cache permanente.
- Colisões de nomes com conteúdos diferentes abortam a preservação; nenhum recurso anterior é substituído silenciosamente.

Validação: 403 recursos preservados, sem colisões. Testes de preservação, repetição idempotente e rejeição de colisão passaram. Downloads reais da release anterior e atual devolveram JavaScript/CSS com hashes iguais aos arquivos originais. Um JavaScript inexistente devolveu 404. Configuração Nginx validada antes do reload; sintaxe do script de deploy validada. Site, API e descoberta de autenticação responderam HTTP 200 após a mudança.

Escopo: corrige incompatibilidade de recursos entre releases. Retorno ao login por expiração de sessão e indisponibilidade durante reinício do backend exigem diagnóstico próprio se forem o sintoma observado. Não houve mudança nos prazos de sessão nem envio de formulários de usuários.
