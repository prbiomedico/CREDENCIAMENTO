"""Regressões de autorização para solicitações legadas e auditoria."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server


def user(user_id, perfil, uf=None):
    return server.User(
        user_id=user_id,
        email=f"{user_id}@example.com",
        name=user_id,
        perfil=perfil,
        detran_uf=uf,
    )


def scope(current_user, *, effective_user_id=None, company_id=None,
          effective_perfil=None, uf=None, viewing_as=None):
    return server.EffectiveScope(
        current_user=current_user,
        effective_user_id=effective_user_id or current_user.user_id,
        effective_company_id=company_id,
        effective_detran_uf=uf if uf is not None else current_user.detran_uf,
        effective_perfil=effective_perfil or current_user.perfil,
        viewing_as=viewing_as,
    )


class RequestStub:
    def __init__(self, body):
        self.body = body

    async def json(self):
        return self.body


class SolicitacoesStub:
    def __init__(self, docs):
        self.docs = docs
        self.last_find = None
        self.last_update = None

    async def find_one(self, query, projection=None):
        self.last_find = query
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        self.last_update = (query, update)
        matched = any(all(doc.get(key) == value for key, value in query.items()) for doc in self.docs)
        return SimpleNamespace(matched_count=1 if matched else 0)


class CursorStub:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args):
        return self

    async def to_list(self, limit):
        return self.docs[:limit]


class AuditoriaStub:
    def __init__(self):
        self.last_query = None

    def find(self, query, projection=None):
        self.last_query = dict(query)
        return CursorStub([])


def run(coro):
    return asyncio.run(coro)


def install_db(monkeypatch, docs):
    solicitacoes = SolicitacoesStub(docs)
    auditoria = AuditoriaStub()
    monkeypatch.setattr(server, "db", SimpleNamespace(
        solicitacoes=solicitacoes,
        auditoria=auditoria,
    ))
    audit_mock = AsyncMock()
    monkeypatch.setattr(server, "registrar_auditoria", audit_mock)
    return solicitacoes, auditoria, audit_mock


def test_dono_submete_solicitacao(monkeypatch):
    solicitacoes, _, audit = install_db(monkeypatch, [{
        "solicitacao_id": "sol_a", "user_id": "empresa_a",
        "company_id": "company_a", "uf": "SP",
    }])
    result = run(server.submeter_solicitacao(
        "sol_a", scope(user("empresa_a", "registradora"))
    ))
    assert result["message"] == "Solicitação submetida ao DETRAN"
    assert solicitacoes.last_find == {"solicitacao_id": "sol_a", "user_id": "empresa_a"}
    audit.assert_awaited_once()


def test_empresa_nao_submete_solicitacao_de_outra(monkeypatch):
    solicitacoes, _, audit = install_db(monkeypatch, [{
        "solicitacao_id": "sol_b", "user_id": "empresa_b",
        "company_id": "company_b", "uf": "RJ",
    }])
    with pytest.raises(server.HTTPException) as exc:
        run(server.submeter_solicitacao(
            "sol_b", scope(user("empresa_a", "registradora"))
        ))
    assert exc.value.status_code == 404
    assert solicitacoes.last_update is None
    audit.assert_not_awaited()


def test_usuario_sem_escopo_nao_submete_por_id(monkeypatch):
    solicitacoes, _, _ = install_db(monkeypatch, [{
        "solicitacao_id": "sol_a", "user_id": "empresa_a", "uf": "SP",
    }])
    with pytest.raises(server.HTTPException) as exc:
        run(server.submeter_solicitacao(
            "sol_a", scope(user("detran_sp", "detran", "SP"))
        ))
    assert exc.value.status_code == 404
    assert solicitacoes.last_find is None


def test_admin_submete_e_trocar_visao_respeita_empresa(monkeypatch):
    admin = user("admin", "sigcr_admin")
    docs = [{"solicitacao_id": "sol_b", "user_id": "empresa_b", "company_id": "company_b", "uf": "RJ"}]
    solicitacoes, _, _ = install_db(monkeypatch, docs)
    run(server.submeter_solicitacao("sol_b", scope(admin)))
    assert solicitacoes.last_update is not None

    solicitacoes.last_update = None
    with pytest.raises(server.HTTPException) as exc:
        run(server.submeter_solicitacao("sol_b", scope(
            admin, effective_user_id="empresa_a", company_id="company_a",
            effective_perfil="registradora",
            viewing_as={"tipo": "empresa", "id": "company_a", "nome": "A"},
        )))
    assert exc.value.status_code == 404
    assert solicitacoes.last_update is None


def test_detran_da_uf_altera_status(monkeypatch):
    solicitacoes, _, audit = install_db(monkeypatch, [{
        "solicitacao_id": "sol_sp", "user_id": "empresa_a", "uf": "SP",
    }])
    result = run(server.atualizar_status_solicitacao(
        "sol_sp", RequestStub({"status": "em_analise", "observacoes": "ok"}),
        scope(user("detran_sp", "detran", "SP")),
    ))
    assert result["message"] == "Status atualizado para em_analise"
    assert solicitacoes.last_find == {"solicitacao_id": "sol_sp", "uf": "SP"}
    assert audit.await_args.args[4]["estado_sigla"] == "SP"


def test_empresa_nao_altera_status_administrativo(monkeypatch):
    solicitacoes, _, audit = install_db(monkeypatch, [{
        "solicitacao_id": "sol_sp", "user_id": "empresa_a", "uf": "SP",
    }])
    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_status_solicitacao(
            "sol_sp", RequestStub({"status": "aprovada"}),
            scope(user("empresa_a", "registradora")),
        ))
    assert exc.value.status_code == 403
    assert solicitacoes.last_update is None
    audit.assert_not_awaited()


def test_detran_de_outra_uf_nao_altera_status(monkeypatch):
    solicitacoes, _, _ = install_db(monkeypatch, [{
        "solicitacao_id": "sol_rj", "user_id": "empresa_a", "uf": "RJ",
    }])
    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_status_solicitacao(
            "sol_rj", RequestStub({"status": "aprovada"}),
            scope(user("detran_sp", "detran_admin", "SP")),
        ))
    assert exc.value.status_code == 404
    assert solicitacoes.last_update is None


def test_admin_altera_status_e_trocar_visao_detran_respeita_uf(monkeypatch):
    admin = user("admin", "sigcr_admin")
    docs = [{"solicitacao_id": "sol_rj", "user_id": "empresa_a", "uf": "RJ"}]
    solicitacoes, _, _ = install_db(monkeypatch, docs)
    run(server.atualizar_status_solicitacao(
        "sol_rj", RequestStub({"status": "aprovada"}), scope(admin),
    ))
    assert solicitacoes.last_update is not None

    solicitacoes.last_update = None
    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_status_solicitacao(
            "sol_rj", RequestStub({"status": "aprovada"}), scope(
                admin, effective_perfil="detran_admin", uf="SP",
                viewing_as={"tipo": "detran", "id": "SP", "nome": "São Paulo"},
            ),
        ))
    assert exc.value.status_code == 404
    assert solicitacoes.last_update is None


def test_auditoria_entidade_usa_mesmo_filtro_da_listagem(monkeypatch):
    _, auditoria, _ = install_db(monkeypatch, [])
    cases = [
        (user("admin", "sigcr_admin"), {"entidade_id": "ent_1"}),
        (user("detran_sp", "detran_admin", "SP"), {
            "detalhes.estado_sigla": "SP", "entidade_id": "ent_1",
        }),
        (user("detran_sp", "detran", "SP"), {
            "user_id": "detran_sp", "entidade_id": "ent_1",
        }),
        (user("empresa_a", "registradora"), {
            "user_id": "empresa_a", "entidade_id": "ent_1",
        }),
    ]
    for current_user, expected in cases:
        run(server.get_auditoria_entidade("ent_1", current_user))
        assert auditoria.last_query == expected


def test_auditoria_detran_admin_sem_uf_preserva_bloqueio(monkeypatch):
    install_db(monkeypatch, [])
    with pytest.raises(server.HTTPException) as exc:
        run(server.get_auditoria_entidade(
            "ent_1", user("detran_sem_uf", "detran_admin")
        ))
    assert exc.value.status_code == 403
