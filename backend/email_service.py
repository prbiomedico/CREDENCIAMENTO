"""E-mail plugável: usa Resend quando RESEND_API_KEY está configurada; sem a
chave, registra em db.email_outbox (modo mock) — nada é perdido, o histórico
fica auditável e o envio real passa a funcionar só configurando a env."""
import os
import logging
from datetime import datetime, timezone
import httpx

logger = logging.getLogger("sigcr.email")


async def enviar_email(db, destinatario: str, assunto: str, html: str, metadados: dict = None) -> str:
    api_key = os.environ.get("RESEND_API_KEY", "")
    remetente = os.environ.get("EMAIL_FROM", "SIGCR <onboarding@resend.dev>")
    registro = {
        "destinatario": destinatario,
        "assunto": assunto,
        "html": html,
        "metadados": metadados or {},
        "provider": "resend" if api_key else "mock",
        "criado_em": datetime.now(timezone.utc).isoformat(),
    }
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"from": remetente, "to": [destinatario], "subject": assunto, "html": html},
                )
                r.raise_for_status()
                registro["status"] = "enviado"
                registro["provider_id"] = r.json().get("id")
        except Exception as e:
            logger.error(f"Falha ao enviar e-mail via Resend: {e}")
            registro["status"] = "erro"
            registro["erro"] = str(e)
    else:
        registro["status"] = "mock_registrado"
        logger.info(f"[EMAIL MOCK] para={destinatario} assunto={assunto}")
    await db.email_outbox.insert_one(registro)
    return registro["status"]
