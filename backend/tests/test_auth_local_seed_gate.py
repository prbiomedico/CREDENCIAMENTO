"""Regressão: as 3 contas demo do auth_local.py (senha hardcoded no
código-fonte, público no GitHub) nunca podem ser seedadas quando
ENVIRONMENT=production. Ver PENDING_ACTIONS.md item 26.

Roda tanto como script (`python3 test_auth_local_seed_gate.py`, precisa só
de motor+bcrypt+PyJWT, já presentes na imagem de produção) quanto via
pytest — não depende do conftest.py/pytest.ini do zip do Emergent (que
exigem AUTH_MODE=local rodando ao vivo), só de um Mongo alcançável.
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
import auth_local

MONGO_URL = os.environ.get(
    "TEST_MONGO_URL",
    "mongodb://sigcr:devtestpass@sigcr-mongodb-devtest:27017/?authSource=admin",
)


async def _run_seed(db_name: str, environment):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[db_name]
    old = os.environ.get("ENVIRONMENT")
    try:
        if environment is None:
            os.environ.pop("ENVIRONMENT", None)
        else:
            os.environ["ENVIRONMENT"] = environment
        await auth_local.seed_local_users(db)
        demo_emails = [u["email"] for u in auth_local.SEED_USERS]
        count_demo = await db.local_users.count_documents({"email": {"$in": demo_emails}})
        count_admin = await db.local_users.count_documents({"role": "sigcr_admin"})
        return count_demo, count_admin
    finally:
        if old is None:
            os.environ.pop("ENVIRONMENT", None)
        else:
            os.environ["ENVIRONMENT"] = old
        await client.drop_database(db_name)
        client.close()


def test_producao_nao_semeia_contas_demo():
    db_name = f"test_authgate_{uuid.uuid4().hex[:8]}"
    demo_count, admin_count = asyncio.run(_run_seed(db_name, "production"))
    assert demo_count == 0, f"contas demo com senha hardcoded foram criadas em produção: {demo_count}"
    assert admin_count == 1, "conta admin deveria sempre existir, mesmo em produção"


def test_producao_case_insensitive():
    """ENVIRONMENT=Production ou PRODUCTION também bloqueia (mesmo padrão de _docs_off em server.py)."""
    db_name = f"test_authgate_{uuid.uuid4().hex[:8]}"
    demo_count, _ = asyncio.run(_run_seed(db_name, "PRODUCTION"))
    assert demo_count == 0


def test_dev_semeia_contas_demo():
    db_name = f"test_authgate_{uuid.uuid4().hex[:8]}"
    demo_count, admin_count = asyncio.run(_run_seed(db_name, None))
    assert demo_count == len(auth_local.SEED_USERS), f"contas demo deveriam existir fora de produção: {demo_count}"
    assert admin_count == 1


if __name__ == "__main__":
    test_producao_nao_semeia_contas_demo()
    print("OK: producao (ENVIRONMENT=production) nao semeia contas demo")
    test_producao_case_insensitive()
    print("OK: producao (ENVIRONMENT=PRODUCTION, case-insensitive) nao semeia contas demo")
    test_dev_semeia_contas_demo()
    print("OK: fora de producao, as 3 contas demo sao seedadas normalmente")
