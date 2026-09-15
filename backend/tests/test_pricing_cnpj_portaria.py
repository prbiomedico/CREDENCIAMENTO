import asyncio
from types import SimpleNamespace

import pytest

import pricing
import server


def run(coro):
    return asyncio.run(coro)


class RequestStub:
    headers = {}
    client = SimpleNamespace(host="127.0.0.1")


class CollectionStub:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            ok = True
            for key, expected in query.items():
                value = doc.get(key)
                if isinstance(expected, dict) and "$ne" in expected:
                    ok = ok and value != expected["$ne"]
                elif isinstance(expected, dict) and "$in" in expected:
                    ok = ok and value in expected["$in"]
                else:
                    ok = ok and value == expected
            if ok:
                return dict(doc)
        return None

    async def insert_one(self, document):
        self.docs.append(dict(document))
        return SimpleNamespace(inserted_id="teste")


def test_precificacao_por_faixas_e_implantacao():
    uma = pricing.calcular_precificacao(1)
    cinco = pricing.calcular_precificacao(5)
    nacional = pricing.calcular_precificacao(27, "anual")
    assert uma["mensalidade_centavos"] == 449_000
    assert uma["implantacao_centavos"] == 810_000
    assert cinco["mensalidade_centavos"] == 889_000
    assert nacional["mensalidade_centavos"] == 2_289_000
    assert nacional["recorrencia_centavos"] == 2_289_000 * 12 * 90 // 100


@pytest.mark.parametrize("quantidade", [0, 28, True])
def test_precificacao_rejeita_quantidade_invalida(quantidade):
    with pytest.raises(ValueError):
        pricing.calcular_precificacao(quantidade)


def test_validacao_cnpj_herda_uf_e_perfil_da_portaria(monkeypatch):
    portarias = CollectionStub([{
        "portaria_id": "portaria_mt",
        "token_publico": "token-mt",
        "publicado_at": "2026-09-15T10:00:00Z",
        "deleted_at": None,
        "estado_sigla": "MT",
        "checklist_itens": [{"perfil_alvo": "registradora"}],
    }])
    companies = CollectionStub([])
    monkeypatch.setattr(server, "db", SimpleNamespace(portarias=portarias, companies=companies))
    server._rate_buckets.clear()
    resposta = run(server.validar_cnpj_para_portaria(
        "token-mt",
        server.ValidacaoCNPJPortariaPayload(cnpj="11.222.333/0001-81", tipo_empresa="registradora"),
        RequestStub(),
    ))
    assert resposta["cnpj"] == "11222333000181"
    assert resposta["estado_sigla"] == "MT"
    assert resposta["empresa_ja_cadastrada"] is False


def test_portaria_nao_aceita_perfil_fora_do_checklist(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(portarias=CollectionStub([{
        "portaria_id": "portaria_mt", "token_publico": "token-mt",
        "publicado_at": "2026-09-15T10:00:00Z", "deleted_at": None,
        "estado_sigla": "MT", "checklist_itens": [{"perfil_alvo": "registradora"}],
    }])))
    with pytest.raises(server.HTTPException) as exc:
        run(server._obter_portaria_publica_para_cadastro("token-mt", "financeira"))
    assert exc.value.status_code == 400


def test_contato_comercial_registra_e_notifica_destinatario_correto(monkeypatch):
    contatos = CollectionStub([])
    emails = []

    async def email_fake(db, destinatario, assunto, html, metadados=None):
        emails.append((destinatario, assunto, html, metadados))
        return "mock_registrado"

    monkeypatch.setattr(server, "db", SimpleNamespace(contatos_comerciais=contatos))
    monkeypatch.setattr(server, "enviar_email", email_fake)
    server._rate_buckets.clear()
    resposta = run(server.registrar_contato_comercial(
        server.ContatoComercialPayload(
            nome="Maria Silva", email="maria@empresa.com.br", telefone="(11) 99999-9999"
        ),
        RequestStub(),
    ))
    assert resposta["recebido"] is True
    assert contatos.docs[0]["status"] == "novo"
    assert emails[0][0] == "contato@sigcr.com.br"
