"""Regressões do vocabulário de empresas e do escopo estadual de Editais."""
import asyncio
from io import BytesIO
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from starlette.datastructures import Headers, UploadFile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server


def run(coro):
    return asyncio.run(coro)


def user(user_id, perfil, uf=None):
    return server.User(
        user_id=user_id,
        email=f"{user_id}@example.com",
        name=user_id,
        perfil=perfil,
        detran_uf=uf,
    )


class RequestStub:
    def __init__(self, body):
        self.body = body

    async def json(self):
        return self.body


class EditaisStub:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.inserted = None
        self.updated = None

    async def insert_one(self, doc):
        self.inserted = dict(doc)
        doc["_id"] = "mongo-id"

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        self.updated = (query, update)
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                doc.update(update["$set"])


def install_editais_db(monkeypatch, docs=None):
    editais = EditaisStub(docs)
    monkeypatch.setattr(server, "db", SimpleNamespace(editais=editais))
    monkeypatch.setattr(server, "registrar_auditoria", AsyncMock())
    return editais


def test_nova_empresa_nasce_no_vocabulario_oficial():
    empresa = server.Company(
        user_id="u1",
        name="Empresa Um",
        nome_fantasia="Empresa Um",
        cnpj="11222333000181",
        endereco="Rua A",
        email_comercial="empresa@example.com",
        whatsapp="11999999999",
        gestor_contrato="Gestor",
    )
    assert empresa.status == "pendente_aprovacao"


def test_detran_cria_edital_somente_na_propria_uf(monkeypatch):
    editais = install_editais_db(monkeypatch)
    criado = run(server.create_edital(
        RequestStub({"titulo": "Edital SP", "uf": "sp"}),
        user("detran_sp", "detran", "SP"),
    ))
    assert criado["uf"] == "SP"
    assert editais.inserted["uf"] == "SP"

    with pytest.raises(server.HTTPException) as exc:
        run(server.create_edital(
            RequestStub({"titulo": "Edital RJ", "uf": "RJ"}),
            user("detran_sp", "detran", "SP"),
        ))
    assert exc.value.status_code == 403


def test_detran_nao_edita_nem_move_edital_de_outra_uf(monkeypatch):
    editais = install_editais_db(monkeypatch, [{
        "edital_id": "edital_rj", "titulo": "RJ", "uf": "RJ",
    }, {
        "edital_id": "edital_sp", "titulo": "SP", "uf": "SP",
    }])

    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_edital(
            "edital_rj", server.EditalUpdate(titulo="Inválido"),
            user("detran_sp", "detran_admin", "SP"),
        ))
    assert exc.value.status_code == 403
    assert editais.updated is None

    with pytest.raises(server.HTTPException) as exc:
        run(server.atualizar_edital(
            "edital_sp", server.EditalUpdate(uf="RJ"),
            user("detran_sp", "detran_admin", "SP"),
        ))
    assert exc.value.status_code == 403
    assert editais.updated is None


def test_admin_pode_editar_edital_de_qualquer_uf(monkeypatch):
    editais = install_editais_db(monkeypatch, [{
        "edital_id": "edital_sp", "titulo": "SP", "uf": "SP",
    }])
    atualizado = run(server.atualizar_edital(
        "edital_sp", server.EditalUpdate(uf="rj"),
        user("admin", "sigcr_admin"),
    ))
    assert atualizado["uf"] == "RJ"
    assert editais.updated is not None


def upload_pdf(conteudo, content_type="application/pdf"):
    return UploadFile(
        BytesIO(conteudo),
        filename="documento.pdf",
        headers=Headers({"content-type": content_type}),
    )


def test_barreira_pdf_rejeita_content_type_ou_assinatura_falsos():
    assert run(server._ler_pdf_validado(upload_pdf(b"%PDF-1.7\n%%EOF")))

    with pytest.raises(server.HTTPException) as exc:
        run(server._ler_pdf_validado(upload_pdf(b"%PDF-1.7", "text/plain")))
    assert exc.value.status_code == 400


def test_barreira_generica_valida_imagem_e_rejeita_extensao_disfarcada():
    png = UploadFile(
        BytesIO(b"\x89PNG\r\n\x1a\nconteudo"),
        filename="logo.png",
        headers=Headers({"content-type": "image/png"}),
    )
    assert run(server._ler_upload_validado(
        png, tipos_permitidos={"image/png"}, limite=1024, contexto="o logotipo"
    ))

    falso = UploadFile(
        BytesIO(b"<script>alert(1)</script>"),
        filename="logo.png",
        headers=Headers({"content-type": "image/png"}),
    )
    with pytest.raises(server.HTTPException) as exc:
        run(server._ler_upload_validado(
            falso, tipos_permitidos={"image/png"}, limite=1024, contexto="o logotipo"
        ))
    assert exc.value.status_code == 400

    with pytest.raises(server.HTTPException) as exc:
        run(server._ler_pdf_validado(upload_pdf(b"arquivo-executavel")))
    assert exc.value.status_code == 400


def test_evento_privado_nao_vaza_para_empresa():
    privado = {"evento_id": "ev1", "status": "rascunho", "uf": "SP", "criado_por": "detran_sp"}
    with pytest.raises(server.HTTPException) as exc:
        server._autorizar_evento(privado, user("empresa", "registradora"))
    assert exc.value.status_code == 403

    publicado = {**privado, "status": "publicado"}
    server._autorizar_evento(publicado, user("empresa", "registradora"))


def test_detran_nao_gerencia_evento_de_outro_autor_ou_uf():
    detran_sp = user("detran_sp", "detran", "SP")
    server._autorizar_evento(
        {"status": "rascunho", "uf": "SP", "criado_por": "detran_sp"},
        detran_sp,
        escrita=True,
    )

    for evento in (
        {"status": "rascunho", "uf": "RJ", "criado_por": "detran_sp"},
        {"status": "rascunho", "uf": "SP", "criado_por": "outro_usuario"},
    ):
        with pytest.raises(server.HTTPException) as exc:
            server._autorizar_evento(evento, detran_sp, escrita=True)
        assert exc.value.status_code == 403


def test_status_livre_nao_pode_corromper_vocabulario_de_empresa(monkeypatch):
    companies = SimpleNamespace(update_one=AsyncMock())
    monkeypatch.setattr(server, "db", SimpleNamespace(companies=companies))
    with pytest.raises(server.HTTPException) as exc:
        run(server.update_company_status("company_1", "qualquer_coisa", user("admin", "sigcr_admin")))
    assert exc.value.status_code == 400
    companies.update_one.assert_not_awaited()


def test_atualizacao_notifica_registradoras_da_uf_sem_duplicar(monkeypatch):
    class Cursor:
        async def to_list(self, limit):
            return [{"user_id": "reg_1"}, {"user_id": "reg_1"}, {"user_id": "reg_2"}]

    companies = SimpleNamespace(find=lambda query, projection: Cursor())
    monkeypatch.setattr(server, "db", SimpleNamespace(companies=companies))
    notificar = AsyncMock()
    monkeypatch.setattr(server, "criar_notificacao", notificar)

    total = run(server._notificar_registradoras_portaria_atualizada({
        "portaria_id": "port_1", "title": "Portaria 1", "estado_sigla": "SP",
    }))
    assert total == 2
    assert notificar.await_count == 2
    assert {call.args[0] for call in notificar.await_args_list} == {"reg_1", "reg_2"}
