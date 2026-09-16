"""Provisiona os três perfis institucionais de homologação.

Uso dentro do container backend, com as senhas fornecidas apenas por
variáveis de ambiente. O script é idempotente e nunca imprime credenciais.
"""
import asyncio
import os
from datetime import datetime, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient


KC_URL = os.environ.get("KEYCLOAK_INTERNAL_URL", "http://sigcr-keycloak:8080")
REALM = os.environ.get("KEYCLOAK_REALM", "sigcr")

PROFILES = (
    {
        "username": "detran.homologacao",
        "email": "detran@sigcr.com.br",
        "firstName": "DETRAN",
        "lastName": "Homologação SIGCR",
        "role": "detran_admin",
        "uf": "PE",
        "password_env": "HOMOLOG_DETRAN_PASSWORD",
    },
    {
        "username": "financeira.homologacao",
        "email": "financeira@sigcr.com.br",
        "firstName": "Financeira",
        "lastName": "Homologação SIGCR",
        "role": "financeira",
        "password_env": "HOMOLOG_FINANCEIRA_PASSWORD",
    },
    {
        "username": "registradora.homologacao",
        "email": "registradora@sigcr.com.br",
        "firstName": "Registradora",
        "lastName": "Homologação SIGCR",
        "role": "registradora",
        "password_env": "HOMOLOG_REGISTRADORA_PASSWORD",
    },
)


async def admin_token(client):
    response = await client.post(
        f"{KC_URL}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": os.environ.get("KEYCLOAK_ADMIN", "admin"),
            "password": os.environ["KEYCLOAK_ADMIN_PASSWORD"],
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]


async def upsert_keycloak_user(client, headers, profile):
    password = os.environ[profile["password_env"]]
    lookup = await client.get(
        f"{KC_URL}/admin/realms/{REALM}/users",
        params={"email": profile["email"], "exact": "true"},
        headers=headers,
    )
    lookup.raise_for_status()
    matches = lookup.json()
    payload = {
        "username": profile["username"],
        "email": profile["email"],
        "firstName": profile["firstName"],
        "lastName": profile["lastName"],
        "enabled": True,
        "emailVerified": True,
        "attributes": {
            "ambiente_homologacao": ["true"],
            **({"detran_uf": [profile["uf"]]} if profile.get("uf") else {}),
        },
    }
    if matches:
        user_id = matches[0]["id"]
        response = await client.put(
            f"{KC_URL}/admin/realms/{REALM}/users/{user_id}", headers=headers, json=payload
        )
        response.raise_for_status()
    else:
        response = await client.post(
            f"{KC_URL}/admin/realms/{REALM}/users", headers=headers, json=payload
        )
        response.raise_for_status()
        lookup = await client.get(
            f"{KC_URL}/admin/realms/{REALM}/users",
            params={"email": profile["email"], "exact": "true"},
            headers=headers,
        )
        lookup.raise_for_status()
        user_id = lookup.json()[0]["id"]

    reset = await client.put(
        f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/reset-password",
        headers=headers,
        json={"type": "password", "value": password, "temporary": False},
    )
    reset.raise_for_status()

    current = await client.get(
        f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/realm",
        headers=headers,
    )
    current.raise_for_status()
    sigcr_roles = [r for r in current.json() if r["name"] in {"registradora", "financeira", "detran", "detran_admin", "sigcr_admin"}]
    if sigcr_roles:
        removed = await client.request(
            "DELETE",
            f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/realm",
            headers=headers,
            json=sigcr_roles,
        )
        removed.raise_for_status()
    role = await client.get(
        f"{KC_URL}/admin/realms/{REALM}/roles/{profile['role']}", headers=headers
    )
    role.raise_for_status()
    assigned = await client.post(
        f"{KC_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/realm",
        headers=headers,
        json=[role.json()],
    )
    assigned.raise_for_status()
    return user_id


async def main():
    required = ["MONGO_URL", "KEYCLOAK_ADMIN_PASSWORD"] + [p["password_env"] for p in PROFILES]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError("Variáveis obrigatórias ausentes: " + ", ".join(missing))

    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ.get("DB_NAME", "sigcr")]
    now = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await admin_token(client)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        ids = {}
        for profile in PROFILES:
            user_id = await upsert_keycloak_user(client, headers, profile)
            ids[profile["role"]] = user_id
            await db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "email": profile["email"],
                        "name": f"{profile['firstName']} {profile['lastName']}",
                        "perfil": profile["role"],
                        "detran_uf": profile.get("uf"),
                        "ambiente_homologacao": True,
                    },
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

    companies = (
        {
            "company_id": "company_homolog_registradora",
            "user_id": ids["registradora"],
            "name": "REGISTRADORA HOMOLOGAÇÃO SIGCR LTDA",
            "nome_fantasia": "Registradora Homologação SIGCR",
            "cnpj": "99999999000191",
            "email_comercial": "registradora@sigcr.com.br",
            "tipo_empresa": "registradora",
            "categorias_credenciamento": ["registradora"],
            "registradora_id": None,
        },
        {
            "company_id": "company_homolog_financeira",
            "user_id": ids["financeira"],
            "name": "FINANCEIRA HOMOLOGAÇÃO SIGCR LTDA",
            "nome_fantasia": "Financeira Homologação SIGCR",
            "cnpj": "99999998000147",
            "email_comercial": "financeira@sigcr.com.br",
            "tipo_empresa": "financeira",
            "categorias_credenciamento": ["financeira"],
            "registradora_id": "company_homolog_registradora",
        },
    )
    for company in companies:
        await db.companies.update_one(
            {"company_id": company["company_id"]},
            {
                "$set": {
                    **company,
                    "endereco": "Ambiente institucional de homologação",
                    "whatsapp": "00000000000",
                    "gestor_contrato": "Equipe SIGCR",
                    "detrans_atuacao": ["PE"],
                    "status": "ativo_contrato_assinado",
                    "ambiente_homologacao": True,
                    "deleted_at": None,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
    mongo.close()
    print("Perfis de homologação provisionados: DETRAN=1 Financeira=1 Registradora=1")


if __name__ == "__main__":
    asyncio.run(main())
