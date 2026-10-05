"""Dashboard completo, exclusões e isolamento da empresa selecionada."""
import asyncio
import os
import uuid
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server


def test_stats_count_all_active_documents_and_selected_company(monkeypatch):
    async def scenario():
        client = AsyncIOMotorClient(os.environ['TEST_MONGO_URL'])
        name = 'test_dashboard_' + uuid.uuid4().hex
        db = client[name]
        monkeypatch.setattr(server, 'db', db)
        admin = server.User(user_id='master', email='master@example.com', name='Master', perfil='sigcr_admin')
        try:
            await db.companies.insert_many([
                {'company_id':'c1','user_id':'owner','tipo_empresa':'registradora'},
                {'company_id':'c2','user_id':'owner','tipo_empresa':'registradora'},
                {'company_id':'removed','user_id':'owner','tipo_empresa':'registradora','deleted_at':'2026-01-01'},
                {'company_id':'homolog','user_id':'test-owner','tipo_empresa':'registradora','ambiente_homologacao':True},
            ])
            await db.documents.insert_many([
                *[{'company_id':'c1','status':'pending','vencimento':'2099-01-01'} for _ in range(150)],
                {'company_id':'c1','status':'approved','vencimento':'2000-01-01'},
                {'company_id':'c1','status':'pending','vencimento':'2000-01-01','deleted_at':'2026-01-01'},
                {'company_id':'c2','status':'pending','vencimento':'2099-01-01'},
                {'company_id':'removed','status':'pending'},
                {'company_id':'homolog','status':'pending'},
            ])
            scope = server.EffectiveScope(current_user=admin, effective_user_id='owner', effective_company_id='c1', effective_perfil='registradora', viewing_as={'tipo':'empresa'})
            stats = await server.get_stats(scope)
            assert stats['total_companies'] == 1
            assert stats['total_documents'] == 151
            assert stats['pending_validations'] == 150
            assert stats['compliance_vermelho'] == 1
            scope = server.EffectiveScope(current_user=admin, effective_user_id='master', effective_perfil='sigcr_admin')
            stats = await server.get_stats(scope)
            assert stats['total_documents'] == 152
            assert stats['pending_validations'] == 151
            assert stats['total_companies'] == 2
            assert stats['compliance_verde'] == 1
            assert stats['compliance_vermelho'] == 1
        finally:
            await client.drop_database(name)
            client.close()
    asyncio.run(scenario())
