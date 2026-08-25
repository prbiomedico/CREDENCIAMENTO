"""Provedor de identidade local (AUTH_MODE=local) — espelha o contrato do
Keycloak (claims sub/email/name/realm_access.roles/detran_uf) para que
get_current_user e o frontend funcionem sem mudanças. Em produção o
AUTH_MODE=keycloak mantém o fluxo OIDC/JWKS intacto."""
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

JWT_ALG = "HS256"
TOKEN_TTL_HOURS = 12
MAX_FAILED = 5
LOCKOUT_MINUTES = 15

SIGCR_ROLES = ["registradora", "detran", "detran_admin", "financeira", "sigcr_admin"]


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_local_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": "sigcr-local",
        "type": "access",
        "sub": user["user_id"],
        "email": user.get("email", ""),
        "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("username", ""),
        "preferred_username": user.get("username", ""),
        "realm_access": {"roles": [user.get("role", "registradora")]},
        "detran_uf": user.get("uf") or None,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def decode_local_token(token: str) -> dict:
    payload = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
    if payload.get("iss") != "sigcr-local":
        raise jwt.InvalidTokenError("issuer inválido")
    return payload


async def provision_user(db, *, username: str, email: str, first_name: str = "",
                         last_name: str = "", password: str, role: str,
                         uf: str = None, enabled: bool = True) -> str:
    if role not in SIGCR_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida: {role}")
    username = username.strip().lower()
    email = email.strip().lower()
    dup = await db.local_users.find_one(
        {"$or": [{"username": username}, {"email": email}]}, {"_id": 0, "user_id": 1}
    )
    if dup:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    user_id = str(uuid.uuid4())
    await db.local_users.insert_one({
        "user_id": user_id,
        "username": username,
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "password_hash": hash_password(password),
        "role": role,
        "uf": (uf or "").upper() or None,
        "enabled": enabled,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return user_id


async def delete_user(db, user_id: str) -> bool:
    r = await db.local_users.delete_one({"user_id": user_id})
    if r.deleted_count:
        await db.users.delete_one({"user_id": user_id})
    return r.deleted_count > 0


async def list_users(db) -> list:
    users = await db.local_users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
    return [{
        "id": u["user_id"],
        "username": u.get("username", ""),
        "email": u.get("email", ""),
        "firstName": u.get("first_name", ""),
        "lastName": u.get("last_name", ""),
        "enabled": u.get("enabled", True),
        "perfil": u.get("role", "registradora"),
        "roles": [u.get("role", "registradora")],
        "uf": u.get("uf"),
    } for u in users]


async def authenticate(db, login: str, password: str, ip: str) -> dict:
    # Lockout por e-mail (não por IP:email): atrás do ingress cada requisição
    # pode chegar com um IP de origem diferente, o que diluía o contador.
    login = login.strip().lower()
    identifier = login
    now = datetime.now(timezone.utc)

    attempt = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempt and attempt.get("count", 0) >= MAX_FAILED:
        locked_until = datetime.fromisoformat(attempt["locked_until"])
        if locked_until > now:
            raise HTTPException(status_code=429, detail="Muitas tentativas — conta bloqueada por 15 minutos")
        await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.local_users.find_one(
        {"$or": [{"email": login}, {"username": login}]}, {"_id": 0}
    )
    if not user or not verify_password(password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1},
             "$set": {"locked_until": (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not user.get("enabled", True):
        raise HTTPException(status_code=403, detail="Conta desativada — contate o administrador")

    await db.login_attempts.delete_one({"identifier": identifier})
    return user


SEED_USERS = [
    {"username": "detran.pr", "email": "detran.pr@demo.sigcr.com.br", "first_name": "DETRAN", "last_name": "Paraná",
     "password": "Detran@2026", "role": "detran_admin", "uf": "PR"},
    {"username": "registradora.demo", "email": "registradora@demo.sigcr.com.br", "first_name": "Registradora", "last_name": "Demo",
     "password": "Registradora@2026", "role": "registradora"},
    {"username": "financeira.demo", "email": "financeira@demo.sigcr.com.br", "first_name": "Financeira", "last_name": "Demo",
     "password": "Financeira@2026", "role": "financeira"},
]


async def _upsert_seed(db, *, username, email, first_name, last_name, password, role, uf=None):
    existing = await db.local_users.find_one({"email": email}, {"_id": 0})
    if existing is None:
        await provision_user(db, username=username, email=email, first_name=first_name,
                             last_name=last_name, password=password, role=role, uf=uf)
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.local_users.update_one(
            {"email": email}, {"$set": {"password_hash": hash_password(password), "role": role}}
        )


async def seed_local_users(db):
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@demo.sigcr.com.br")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    await _upsert_seed(db, username="admin", email=admin_email, first_name="Administrador",
                       last_name="SIGCR", password=admin_password, role="sigcr_admin")
    # Gate de ambiente (PENDING_ACTIONS.md item 26): as 3 contas demo abaixo
    # têm senha hardcoded no código-fonte (público no GitHub). Nunca seedar em
    # produção — só em preview/dev, onde servem pra teste manual rápido.
    if os.environ.get("ENVIRONMENT", "").lower() == "production":
        return
    for u in SEED_USERS:
        await _upsert_seed(db, **u)
