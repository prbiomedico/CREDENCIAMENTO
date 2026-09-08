# Serviços operacionais: ClamAV, Resend e Turnstile

Nada deste documento ativa produção sozinho. Valores secretos ficam apenas em
`/opt/sigcr/backend/.env`; a site key pública fica em `frontend/.env.production`.

## ClamAV

1. Subir `docker compose -f ops/clamav.compose.yml up -d`.
2. Aguardar `docker inspect sigcr-clamav --format '{{.State.Health.Status}}'` retornar `healthy`.
3. Configurar `CLAMAV_HOST=sigcr-clamav`, `CLAMAV_PORT=3310` e inicialmente
   `CLAMAV_REQUIRED=false`.
4. Fazer upload controlado de PDF válido e do arquivo de teste EICAR.
5. Somente após ambos passarem como esperado, usar `CLAMAV_REQUIRED=true` e
   reconstruir o backend pelo script oficial. Isso torna falhas do scanner
   bloqueantes (HTTP 503).

## Resend

1. Verificar `sigcr.com.br` no painel Resend e publicar os registros SPF/DKIM.
2. Configurar `RESEND_API_KEY` e `EMAIL_FROM=SIGCR <notificacoes@sigcr.com.br>`.
3. Executar a rotina de vencimentos com uma conta interna de teste.
4. Conferir `email_outbox`: `status=enviado` e `provider_id` preenchido.

## Cloudflare Turnstile

1. Criar widget para `sigcr.com.br` e obter site key + secret key.
2. Configurar `TURNSTILE_SECRET_KEY` no backend e
   `REACT_APP_TURNSTILE_SITE_KEY` antes do build do frontend.
3. Validar cadastro humano, token ausente, expirado e inválido.

## Ordem de ativação e rollback

Ativar um serviço por vez: Resend, Turnstile e por último ClamAV fail-closed.
Rollback: remover a chave do Resend/Turnstile ou voltar
`CLAMAV_REQUIRED=false`, sempre seguido do deploy oficial do serviço afetado.
