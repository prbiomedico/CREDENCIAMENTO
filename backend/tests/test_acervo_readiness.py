"""Contratos de leitura: acervo preparado e mapa por empresa, em Mongo descartável."""
import asyncio
import os
import sys
import uuid
from pathlib import Path
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server


def test_acervo_e_mapa_por_visao(monkeypatch):
    async def scenario():
        client = AsyncIOMotorClient(os.environ['TEST_MONGO_URL'])
        name = 'test_readiness_' + uuid.uuid4().hex
        db = client[name]
        monkeypatch.setattr(server, 'db', db)
        admin = server.User(user_id='master', email='master@example.com', name='Master', perfil='sigcr_admin')
        active_scope = server.EffectiveScope(current_user=admin, effective_user_id='owner1', effective_company_id='c1', effective_perfil='registradora', viewing_as={'tipo':'empresa'})
        server.app.dependency_overrides[server.get_effective_scope] = lambda: active_scope
        try:
            await db.companies.insert_many([
                {'company_id':'c1','user_id':'owner1','detrans_atuacao':['SP'],'tipo_empresa':'registradora'},
                {'company_id':'c2','user_id':'owner2','detrans_atuacao':['RN'],'tipo_empresa':'registradora'},
            ])
            await db.portarias.insert_many([
                {'portaria_id':'ready','title':'Portaria teste','content':'Teste','source':'Teste','date':'2026-09-05','link_pdf':'/tmp/exemplo.pdf','estado_sigla':'SP'},
                {'portaria_id':'missing','title':'Portaria teste','content':'Teste','source':'Teste','date':'2026-09-05','link_pdf':None,'estado_sigla':'SP'},
                {'portaria_id':'draft','title':'Portaria teste','content':'Teste','source':'Teste','date':'2026-09-05','link_pdf':'/tmp/exemplo.pdf','estado_sigla':'SP','criado_via':'wizard'},
                {'portaria_id':'deleted','title':'Portaria teste','content':'Teste','source':'Teste','date':'2026-09-05','link_pdf':'/tmp/exemplo.pdf','deleted_at':'2026-01-01'},
            ])
            await db.credenciamentos.insert_many([
                {'company_id':'c1','estado_sigla':'SP','status':'ativo'},
                {'company_id':'c2','estado_sigla':'RN','status':'ativo'},
                {'company_id':'c1','estado_sigla':'CE','status':'sem_efeito'},
                {'company_id':'c1','estado_sigla':'BA','status':'ativo','deleted_at':'2026-01-01'},
            ])
            await db.submissoes.insert_one({'company_id':'c1','estado_sigla':'AP','status':'em_diligencia'})
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url='http://test') as http:
                listed = await http.get('/api/portarias')
                searched = await http.get('/api/portarias/search', params={'q':'teste'})
                assert listed.status_code == searched.status_code == 200
                assert [p['portaria_id'] for p in searched.json()] == ['ready']
                assert [p['portaria_id'] for p in listed.json()] == ['ready']
                assert (await http.get('/api/portarias/draft/pdf')).status_code == 404
                response = await http.get('/api/mapa-nacional')
                assert response.status_code == 200
                mapa = {x['sigla']:x for x in response.json()}
                assert mapa['SP']['aprovadas'] == 1
                assert mapa['RN']['aprovadas'] == 0
                assert mapa['CE']['aprovadas'] == mapa['BA']['aprovadas'] == 0
                assert mapa['AP']['status_mapa'] == 'em_processo'
                active_scope = server.EffectiveScope(current_user=admin, effective_user_id='master', effective_perfil='sigcr_admin')
                mapa = {x['sigla']:x for x in (await http.get('/api/mapa-nacional')).json()}
                assert mapa['RN']['aprovadas'] == 1
                searched = await http.get('/api/portarias/search', params={'q':'teste'})
                assert len(searched.json()) == 3
                active_scope = server.EffectiveScope(current_user=admin, effective_user_id='master', effective_perfil='detran', effective_detran_uf='SP')
                assert [x['sigla'] for x in (await http.get('/api/mapa-nacional')).json()] == ['SP']
        finally:
            server.app.dependency_overrides.clear()
            await client.drop_database(name)
            client.close()
    asyncio.run(scenario())
