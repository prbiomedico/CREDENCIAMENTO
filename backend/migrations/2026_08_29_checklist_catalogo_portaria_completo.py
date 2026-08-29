"""
Substitui o catálogo reduzido inicial (12 itens genéricos, só perfil_alvo=
registradora) de db.checklist_catalogo_portaria pelos dois catálogos oficiais
completos que o wizard Criar Evento (passo Documentos) deveria estar usando
desde o início — pedido do Pedro, 2026-08-29:

  - CONTRAN 807 completo (31 itens, 6 blocos) -> perfil_alvo="registradora"
  - Edital DETRAN-DF nº 003/2022 completo (12 itens, 4 blocos) -> perfil_alvo="financeira"

Reaproveita as mesmas listas (CHECKLIST_CONTRAN_807/CHECKLIST_DETRAN_DF_003_2022)
já usadas em produção pelo checklist de cadastro-base/upload de documentos —
importadas direto de server.py, nunca retranscritas, pra não arriscar
divergência de texto regulatório entre os dois usos.

O que este script NÃO faz (deliberado, ver PENDING_ACTIONS.md): não toca
nenhuma portaria existente (db.portarias.checklist_itens) — cada
PortariaChecklistItem já é um snapshot independente (nome/descricao/
perfil_alvo copiados na hora da criação/edição da portaria), então trocar o
catálogo não muda retroativamente o que uma portaria publicada já mostra. O
backfill de portarias reais pro catálogo novo fica pra depois, esperando a
decisão separada das 13 UFs ambíguas.

Os 12 itens antigos do catálogo (cat_b1_*/cat_b2_*/cat_b3_*) são só
desativados (ativo=False), nunca apagados — se alguma portaria real já
referencia um deles via catalogo_item_id, a referência e o snapshot
embutido continuam intactos; só somem da lista de itens disponíveis pra
NOVAS portarias.

Idempotente: reinserir os itens novos é um no-op se o item_id já existe;
desativar um item já desativado também é no-op.

Uso:
    cd backend && python3 migrations/2026_08_29_checklist_catalogo_portaria_completo.py [--dry-run]
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient
import server as srv

ITEM_IDS_ANTIGOS = [
    "cat_b1_ato_constitutivo", "cat_b1_alvara_funcionamento", "cat_b1_cnpj",
    "cat_b1_regularidade_fiscal", "cat_b1_seguridade_fgts", "cat_b1_declaracao_unica",
    "cat_b2_balanco", "cat_b2_certidao_falencia",
    "cat_b3_atestado_capacidade_dados", "cat_b3_iso27701", "cat_b3_compliance",
    "cat_b3_sac", "cat_b3_iso27001",
]


def montar_itens_novos():
    agora = datetime.now(timezone.utc).isoformat()
    itens = (
        [{**item, "perfil_alvo": "registradora"} for item in srv.CHECKLIST_CONTRAN_807]
        + [{**item, "perfil_alvo": "financeira"} for item in srv.CHECKLIST_DETRAN_DF_003_2022]
    )
    return [
        {
            "item_id": item["item_id"], "bloco": item["bloco"], "nome": item["nome"],
            "descricao": item["descricao"], "perfil_alvo": item["perfil_alvo"],
            "ativo": True, "created_by": None, "created_at": agora,
        }
        for item in itens
    ]


def main():
    dry_run = "--dry-run" in sys.argv
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    itens_novos = montar_itens_novos()
    ids_novos = {i["item_id"] for i in itens_novos}
    print(f"\nCatálogo novo: {len(itens_novos)} itens "
          f"({sum(1 for i in itens_novos if i['perfil_alvo'] == 'registradora')} registradora, "
          f"{sum(1 for i in itens_novos if i['perfil_alvo'] == 'financeira')} financeira)")

    ja_existentes = set(
        d["item_id"] for d in db.checklist_catalogo_portaria.find(
            {"item_id": {"$in": list(ids_novos)}}, {"_id": 0, "item_id": 1}
        )
    )
    a_inserir = [i for i in itens_novos if i["item_id"] not in ja_existentes]
    print(f"{len(ja_existentes)} já presentes (idempotente, não re-inseridos); {len(a_inserir)} a inserir.")
    for item in a_inserir:
        print(f"  + {item['item_id']} (bloco {item['bloco']}, {item['perfil_alvo']}): {item['nome']}")
        if not dry_run:
            db.checklist_catalogo_portaria.insert_one(item)

    antigos_ativos = list(db.checklist_catalogo_portaria.find(
        {"item_id": {"$in": ITEM_IDS_ANTIGOS}, "ativo": True}, {"_id": 0, "item_id": 1, "nome": 1}
    ))
    print(f"\n{len(antigos_ativos)} item(ns) do catálogo reduzido antigo, ainda ativo(s) -- desativando (soft-disable, nunca apagando):")
    for item in antigos_ativos:
        em_uso = db.portarias.find_one({"checklist_itens.catalogo_item_id": item["item_id"], "deleted_at": None})
        aviso = " [EM USO por uma portaria real -- desativado mesmo assim, snapshot da portaria não é afetado]" if em_uso else ""
        print(f"  - {item['item_id']}: {item['nome']}{aviso}")
        if not dry_run:
            db.checklist_catalogo_portaria.update_one({"item_id": item["item_id"]}, {"$set": {"ativo": False}})

    print("\nConcluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
