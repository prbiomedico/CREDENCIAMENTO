"""Invariantes de segurança da Gestão de Usuários V3."""
import asyncio
from unittest.mock import AsyncMock

import pytest

import server


class ResponseStub:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class ClientStub:
    def __init__(self, admins):
        self.admins = admins

    async def get(self, url, headers=None):
        assert url.endswith('/roles/sigcr_admin/users?first=0&max=200')
        return ResponseStub(self.admins)


def run(coro):
    return asyncio.run(coro)


def test_protege_o_unico_admin_ativo():
    client = ClientStub([{"id": "admin-1", "enabled": True}])
    with pytest.raises(server.HTTPException) as exc:
        run(server._proteger_ultimo_admin_keycloak(client, {}, "admin-1"))
    assert exc.value.status_code == 409


def test_permite_operacao_quando_existe_outro_admin_ativo():
    client = ClientStub([
        {"id": "admin-1", "enabled": True},
        {"id": "admin-2", "enabled": True},
        {"id": "admin-3", "enabled": False},
    ])
    assert run(server._proteger_ultimo_admin_keycloak(client, {}, "admin-1")) is None


def test_senha_tem_limite_definido_no_contrato():
    with pytest.raises(Exception):
        server.RedefinirSenhaUsuarioPayload(password="curta")
    payload = server.RedefinirSenhaUsuarioPayload(password="segura-123", temporary=True)
    assert payload.temporary is True


def test_rotas_v3_exigem_dependencia_de_autorizacao():
    caminhos = {
        '/api/admin/usuarios/{user_id}',
        '/api/admin/usuarios/{user_id}/redefinir-senha',
        '/api/admin/usuarios/{user_id}/encerrar-sessoes',
        '/api/admin/usuarios/{user_id}/sessoes',
        '/api/admin/usuarios/{user_id}/historico',
        '/api/admin/usuarios/{user_id}/exigir-mfa',
    }
    rotas = {route.path: route for route in server.api_router.routes if getattr(route, 'path', '') in caminhos}
    assert set(rotas) == caminhos
    assert all(route.dependant.dependencies for route in rotas.values())


class KeycloakClientStub:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def _call(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        key = (method, url.rsplit('/', 1)[-1])
        response = self.responses.get(key, self.responses.get(method, ResponseStub({}, 204)))
        return response

    async def get(self, url, **kwargs):
        return await self._call('GET', url, **kwargs)

    async def put(self, url, **kwargs):
        return await self._call('PUT', url, **kwargs)

    async def post(self, url, **kwargs):
        return await self._call('POST', url, **kwargs)

    async def delete(self, url, **kwargs):
        return await self._call('DELETE', url, **kwargs)

    async def request(self, method, url, **kwargs):
        return await self._call(method, url, **kwargs)


def admin():
    return server.User(user_id='admin-1', email='admin@example.com', name='Admin', perfil='sigcr_admin')


def instalar_httpx(monkeypatch, client):
    monkeypatch.setattr(server, 'get_kc_admin_token', AsyncMock(return_value='token'))
    monkeypatch.setattr(server.httpx, 'AsyncClient', lambda: client)


def test_redefinir_senha_revoga_sessoes_e_audita_sem_segredo(monkeypatch):
    client = KeycloakClientStub({
        ('PUT', 'reset-password'): ResponseStub({}, 204),
        ('POST', 'logout'): ResponseStub({}, 204),
    })
    instalar_httpx(monkeypatch, client)
    auditoria = AsyncMock()
    monkeypatch.setattr(server, 'registrar_auditoria', auditoria)

    resposta = run(server.redefinir_senha_usuario(
        'user-1', server.RedefinirSenhaUsuarioPayload(password='Senha#Segura2026'), admin(),
    ))

    assert resposta['message'] == 'Senha temporária definida'
    assert [method for method, url, _ in client.calls if url.endswith('/logout')] == ['POST']
    detalhes = auditoria.await_args.args[-1]
    assert detalhes == {'temporary': True}
    assert 'Senha#Segura2026' not in repr(auditoria.await_args)


def test_desativacao_revoga_sessoes(monkeypatch):
    client = KeycloakClientStub({
        ('GET', 'user-1'): ResponseStub({'id': 'user-1', 'enabled': True}),
        ('GET', 'users?first=0&max=200'): ResponseStub([
            {'id': 'admin-1', 'enabled': True}, {'id': 'admin-2', 'enabled': True},
        ]),
        ('PUT', 'user-1'): ResponseStub({}, 204),
        ('POST', 'logout'): ResponseStub({}, 204),
    })
    instalar_httpx(monkeypatch, client)
    monkeypatch.setattr(server, 'registrar_auditoria', AsyncMock())

    resposta = run(server.atualizar_status_usuario(
        'user-1', server.AtualizarStatusUsuarioPayload(enabled=False), admin(),
    ))

    assert resposta['message'] == 'Usuário desativado'
    assert any(method == 'POST' and url.endswith('/logout') for method, url, _ in client.calls)


def test_listagem_de_sessoes_remove_dados_sensiveis(monkeypatch):
    client = KeycloakClientStub({
        ('GET', 'sessions'): ResponseStub([{
            'id': 'session-1', 'ipAddress': '127.0.0.1', 'start': 10, 'lastAccess': 20,
            'clients': {'frontend': 'SIGCR'}, 'accessToken': 'nunca-expor',
        }]),
    })
    instalar_httpx(monkeypatch, client)

    resposta = run(server.listar_sessoes_usuario('user-1', admin()))

    assert resposta == [{
        'id': 'session-1', 'ip_address': '127.0.0.1', 'inicio': 10,
        'ultimo_acesso': 20, 'clientes': ['SIGCR'],
    }]
    assert 'nunca-expor' not in repr(resposta)


def test_exigir_mfa_preserva_acoes_e_revoga_sessoes(monkeypatch):
    client = KeycloakClientStub({
        ('GET', 'user-1'): ResponseStub({'id': 'user-1', 'requiredActions': ['VERIFY_EMAIL']}),
        ('PUT', 'user-1'): ResponseStub({}, 204),
        ('POST', 'logout'): ResponseStub({}, 204),
    })
    instalar_httpx(monkeypatch, client)
    auditoria = AsyncMock()
    monkeypatch.setattr(server, 'registrar_auditoria', auditoria)

    resposta = run(server.exigir_mfa_usuario('user-1', admin()))

    assert resposta['message'] == 'MFA será configurado no próximo acesso'
    atualizacao = next(kwargs['json'] for method, url, kwargs in client.calls if method == 'PUT')
    assert atualizacao['requiredActions'] == ['VERIFY_EMAIL', 'CONFIGURE_TOTP']
    assert any(method == 'POST' and url.endswith('/logout') for method, url, _ in client.calls)
    auditoria.assert_awaited_once()
