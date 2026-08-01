"""
Preenche checklist_item_id em documentos de empresa (db.documents) enviados
ANTES do checklist CONTRAN 807 se tornar obrigatório no upload (2026-08-01) —
esses documentos não têm esse campo, e sem ele ficam invisíveis no checklist
(que só enxerga documentos vinculados a um item).

Mapeamento é deliberadamente conservador: só migra document_type com
correspondência clara e seguridade ao item do catálogo. Onde não há
correspondência óbvia (ex: "licenca" pode ser alvará de funcionamento, que
não é o mesmo documento que "Inscrição Estadual/Municipal"), a migração NÃO
inventa um vínculo — só lista como exceção pra revisão manual (o usuário
final precisa reenviar esse documento apontando pro item certo, ou um humano
decide o vínculo com contexto que o script não tem).

Idempotente: só toca documentos com checklist_item_id ausente/None; rodar de
novo não muda nada que já foi migrado.

Uso:
    python3 migrations/2026_08_01_checklist_contran_807_backfill.py [--dry-run]
"""
import os
import sys
from pymongo import MongoClient

# document_type -> item_id do catálogo CHECKLIST_CONTRAN_807.
# Só entra aqui quando a correspondência é inequívoca. Ver server.py pra
# conferir o catálogo completo (CHECKLIST_CONTRAN_807).
MAPEAMENTO_SEGURO = {
    "cnpj": "b1_cnpj",
    "certidao_fgts": "b1_fgts",
    "balanco": "b2_balanco_patrimonial",
    "iso_27001": "b5_iso_27001",
    "certidao_fiscal": "b1_certidoes_regularidade_fiscal",
}

# document_type sem mapeamento seguro, com o motivo — documentado aqui em vez
# de forçar um vínculo. Só pra deixar a intenção explícita no código; o
# script não precisa deste dict pra funcionar (qualquer document_type fora
# de MAPEAMENTO_SEGURO já vira exceção automaticamente).
EXCECOES_CONHECIDAS = {
    "licenca": "Pode ser alvará de funcionamento — não é o mesmo documento que 'Inscrição Estadual/Municipal' do catálogo.",
    "iso_27301": "Catálogo tem ISO 27001 (b5) e ISO 27701 (b3/b5) — 27301 é uma norma diferente (continuidade de negócio), sem item correspondente.",
    "atestado_tecnico": "Item do catálogo (b3_atestado_capacidade_dados_pessoais) é especificamente sobre dados pessoais/LGPD — mais estreito que 'atestado técnico' genérico.",
    "compliance": "Ambíguo entre 'Programa de Compliance' (gestão) e 'Laudo/Certidão de Conformidade LGPD' (item do catálogo) — sem contexto suficiente pra decidir.",
    "outros": "Catch-all — nunca tem correspondência segura.",
}


def main():
    dry_run = "--dry-run" in sys.argv

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    pendentes = list(db.documents.find(
        {"deleted_at": None, "$or": [{"checklist_item_id": None}, {"checklist_item_id": {"$exists": False}}]},
        {"_id": 0, "document_id": 1, "company_id": 1, "document_type": 1, "document_name": 1},
    ))

    if not pendentes:
        print("Nenhum documento sem checklist_item_id.")
        client.close()
        return

    migrados = []
    excecoes = []
    for doc in pendentes:
        item_id = MAPEAMENTO_SEGURO.get(doc["document_type"])
        if item_id:
            migrados.append((doc, item_id))
        else:
            excecoes.append(doc)

    print(f"\n{len(migrados)} documento(s) com mapeamento seguro:")
    for doc, item_id in migrados:
        print(f"  {doc['document_id']} (\"{doc['document_name']}\", tipo={doc['document_type']}, empresa={doc['company_id']}) -> {item_id}")
        if not dry_run:
            db.documents.update_one({"document_id": doc["document_id"]}, {"$set": {"checklist_item_id": item_id}})

    print(f"\n{len(excecoes)} documento(s) SEM mapeamento seguro (não tocados):")
    for doc in excecoes:
        motivo = EXCECOES_CONHECIDAS.get(doc["document_type"], "document_type sem entrada em MAPEAMENTO_SEGURO nem EXCECOES_CONHECIDAS.")
        print(f"  {doc['document_id']} (\"{doc['document_name']}\", tipo={doc['document_type']}, empresa={doc['company_id']}) -- {motivo}")

    print("\nConcluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
