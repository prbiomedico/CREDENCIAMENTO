import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
import server
from test_security_solicitacoes_auditoria import user, scope, CursorStub, RequestStub


def run(c): return asyncio.run(c)


def test_renovacao_fora_janela_nao_cria_pedido(monkeypatch):
    cred = {'credenciamento_id':'ap','company_id':'hd','estado_sigla':'AP','categoria':'registradora','status':'ativo','validade':'2099-04-15'}
    subs = SimpleNamespace(insert_one=AsyncMock())
    monkeypatch.setattr(server, 'db', SimpleNamespace(credenciamentos=SimpleNamespace(find_one=AsyncMock(return_value=cred)), submissoes=subs))
    monkeypatch.setattr(server, '_autorizar_acesso_empresa', AsyncMock())
    with pytest.raises(server.HTTPException) as exc:
        run(server.iniciar_renovacao('ap', 'p', scope(user('hd','registradora'))))
    assert exc.value.status_code == 409
    subs.insert_one.assert_not_awaited()


def test_detran_nao_solicita_renovacao_pela_empresa(monkeypatch):
    monkeypatch.setattr(server, 'db', SimpleNamespace(credenciamentos=SimpleNamespace(find_one=AsyncMock(return_value={'company_id':'hd'}))))
    with pytest.raises(server.HTTPException) as exc:
        run(server.iniciar_renovacao('ap','p',scope(user('detran','detran','AP'))))
    assert exc.value.status_code == 403


def test_guarda_upload_e_submissao_e_resposta_apos_vencimento(monkeypatch):
    monkeypatch.setattr(server, '_janela_da_submissao', AsyncMock(return_value={'disponivel':False,'motivo':'Fora da janela'}))
    with pytest.raises(server.HTTPException): run(server._exigir_janela_renovacao({'status':'rascunho'}))
    run(server._exigir_janela_renovacao({'status':'em_diligencia'}))


def test_criacao_idempotente_por_credenciamento_e_ciclo(monkeypatch):
    cred = {'credenciamento_id':'ap','company_id':'hd','estado_sigla':'AP','categoria':'registradora','status':'ativo','validade':'2027-04-15'}
    port = {'portaria_id':'p','checklist_itens':[{'item_id':'i','nome':'CNPJ','perfil_alvo':'registradora'}]}
    stored = {}
    async def find(query, projection=None):
        return stored.get('doc')
    async def insert(doc): stored['doc'] = doc
    subs = SimpleNamespace(find_one=AsyncMock(side_effect=find), insert_one=AsyncMock(side_effect=insert))
    monkeypatch.setattr(server,'db',SimpleNamespace(credenciamentos=SimpleNamespace(find_one=AsyncMock(return_value=cred)),companies=SimpleNamespace(find_one=AsyncMock(return_value={'company_id':'hd','tipo_empresa':'registradora'})),portarias=SimpleNamespace(find_one=AsyncMock(return_value=port)),submissoes=subs))
    monkeypatch.setattr(server,'janela_renovacao',lambda c: {'disponivel':True,'validade':'2027-04-15'})
    monkeypatch.setattr(server,'_autorizar_acesso_empresa',AsyncMock())
    monkeypatch.setattr(server,'registrar_auditoria',AsyncMock())
    result = run(server.iniciar_renovacao('ap','p',scope(user('hd','registradora'))))
    again = run(server.iniciar_renovacao('ap','p',scope(user('hd','registradora'))))
    assert result['submissao_id'] == again['submissao_id']
    assert result['credenciamento_origem_id'] == 'ap' and result['ciclo_validade']=='2027-04-15'
    assert result['status']=='rascunho'
    subs.insert_one.assert_awaited_once()


def test_acompanhamento_rejeita_empresa_de_terceiro(monkeypatch):
    monkeypatch.setattr(server,'db',SimpleNamespace(companies=SimpleNamespace(find_one=AsyncMock(return_value={'company_id':'outra','user_id':'outro'}))))
    with pytest.raises(server.HTTPException) as exc:
        run(server.acompanhamento_empresa_estado('outra','AP',scope(user('hd','registradora'))))
    assert exc.value.status_code == 403


def test_solicitacoes_legadas_detran_so_propria_uf(monkeypatch):
    queries=[]
    def find(q,p=None): queries.append(q);return CursorStub([])
    monkeypatch.setattr(server,'db',SimpleNamespace(solicitacoes=SimpleNamespace(find=find)))
    run(server.get_solicitacoes(scope(user('d','detran','AP'))))
    assert queries==[{'uf':'AP'}]


def test_status_legado_arbitrario_rejeitado(monkeypatch):
    col=SimpleNamespace(find_one=AsyncMock(return_value={'solicitacao_id':'s','uf':'AP'}),update_one=AsyncMock())
    monkeypatch.setattr(server,'db',SimpleNamespace(solicitacoes=col))
    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_status_solicitacao('s',RequestStub({'status':'inventado'}),scope(user('d','detran','AP'))))
    assert exc.value.status_code==400
    col.update_one.assert_not_awaited()


def test_dossie_integrado_isola_empresa_e_uf(monkeypatch):
    import os, uuid, httpx
    from motor.motor_asyncio import AsyncIOMotorClient
    async def scenario():
        client = AsyncIOMotorClient(os.environ['TEST_MONGO_URL'])
        name = 'test_acompanhamento_' + uuid.uuid4().hex
        db = client[name]
        monkeypatch.setattr(server, 'db', db)
        effective = scope(user('hd-owner', 'registradora'))
        server.app.dependency_overrides[server.get_effective_scope] = lambda: effective
        try:
            await db.companies.insert_many([{'company_id':'hd','user_id':'hd-owner','name':'HD'}, {'company_id':'outra','user_id':'outro','name':'Outra'}])
            await db.submissoes.insert_many([{'submissao_id':'ap','company_id':'hd','estado_sigla':'AP'}, {'submissao_id':'rn','company_id':'hd','estado_sigla':'RN'}])
            await db.documents.insert_many([{'document_id':'doc-ap','company_id':'hd','submissao_id':'ap'}, {'document_id':'doc-rn','company_id':'hd','submissao_id':'rn'}, {'document_id':'doc-outra','company_id':'outra','submissao_id':'ap'}, {'document_id':'excluido','company_id':'hd','submissao_id':'ap','deleted_at':'2026-01-01'}])
            await db.notificacoes.insert_many([{'notificacao_id':'n1','user_id':'hd-owner','dados':{'submissao_id':'ap'}}, {'notificacao_id':'n2','user_id':'outro','dados':{'submissao_id':'ap'}}, {'notificacao_id':'n3','user_id':'hd-owner','dados':{'submissao_id':'rn'}}])
            await db.portarias.insert_many([{'portaria_id':'publicada','estado_sigla':'AP'}, {'portaria_id':'rascunho','estado_sigla':'AP','criado_via':'wizard'}, {'portaria_id':'rn','estado_sigla':'RN'}])
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url='http://test') as http:
                r = await http.get('/api/companies/hd/acompanhamento/AP'); assert r.status_code == 200, r.text
                payload = r.json()
                assert [d['document_id'] for d in payload['documentos']] == ['doc-ap']
                assert [n['notificacao_id'] for n in payload['comunicacoes']] == ['n1']
                assert [p['portaria_id'] for p in payload['portarias']] == ['publicada']
                assert (await http.get('/api/companies/outra/acompanhamento/AP')).status_code == 403
                effective = scope(user('detran','detran','AP'))
                assert (await http.get('/api/companies/hd/acompanhamento/AP')).status_code == 403
        finally:
            server.app.dependency_overrides.clear()
            await client.drop_database(name); client.close()
    run(scenario())
