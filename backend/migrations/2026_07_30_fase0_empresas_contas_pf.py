"""
Fase 0 do cadastro público/Stripe (planejado em 2026-07-30) — migração de dados,
sem mudança de rota ou comportamento de API.

O que faz:
1. Remapeia companies.status do vocabulário antigo para o novo, explicitamente
   (não um rename cego): pending -> pendente_aprovacao, approved -> ativo_contrato_assinado,
   rejected -> rejeitado. Idempotente: só toca documentos cujo status ainda é um dos
   três valores antigos: rodar de novo não faz nada na segunda vez.
2. Preenche tipo_empresa="registradora" em qualquer company sem esse campo (todas as
   empresas existentes hoje são registradoras — não há financeira/detran ainda).
3. Cria os índices únicos: companies.cnpj, companies.responsavel.cpf (parcial — só
   aplica quando o campo existir, já que é opcional e a maioria dos docs não tem),
   contas_pf.cpf (a coleção pode nem existir ainda; create_index cria implicitamente).
4. Garante a existência das coleções contas_pf e assinaturas (vazias) sem inserir
   nenhum documento — só para elas aparecerem no banco desde já.

Uso:
    python3 migrations/2026_07_30_fase0_empresas_contas_pf.py [--dry-run]

--dry-run mostra o que seria feito sem gravar nada.
"""
import os
import sys
from pymongo import MongoClient, ASCENDING

STATUS_MAP = {
    "pending": "pendente_aprovacao",
    "approved": "ativo_contrato_assinado",
    "rejected": "rejeitado",
}


def main():
    dry_run = "--dry-run" in sys.argv

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"=== Conectado em {db_name} (dry_run={dry_run}) ===")

    # 1. Remapeamento de status (explícito, idempotente)
    total_status_migrados = 0
    for old, new in STATUS_MAP.items():
        count = db.companies.count_documents({"status": old})
        print(f"companies.status == {old!r}: {count} documento(s) -> {new!r}")
        if count and not dry_run:
            result = db.companies.update_many({"status": old}, {"$set": {"status": new}})
            total_status_migrados += result.modified_count
    print(f"Total migrado: {total_status_migrados}")

    # 2. tipo_empresa default para docs existentes
    sem_tipo = db.companies.count_documents({"tipo_empresa": {"$exists": False}})
    print(f"companies sem tipo_empresa: {sem_tipo} -> 'registradora'")
    if sem_tipo and not dry_run:
        result = db.companies.update_many(
            {"tipo_empresa": {"$exists": False}}, {"$set": {"tipo_empresa": "registradora"}}
        )
        print(f"tipo_empresa preenchido em {result.modified_count} documento(s)")

    # 3. Índices únicos — checa duplicatas antes, pra não estourar em produção
    dup_cnpj = list(db.companies.aggregate([
        {"$match": {"cnpj": {"$ne": None}}},
        {"$group": {"_id": "$cnpj", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ]))
    if dup_cnpj:
        print(f"AVISO: {len(dup_cnpj)} CNPJ(s) duplicado(s), índice único de companies.cnpj NÃO criado: {dup_cnpj}")
    elif not dry_run:
        db.companies.create_index([("cnpj", ASCENDING)], unique=True, name="uniq_cnpj")
        print("Índice único criado: companies.cnpj")
    else:
        print("(dry-run: sem duplicatas de cnpj, índice seria criado)")

    dup_cpf = list(db.companies.aggregate([
        {"$match": {"responsavel.cpf": {"$exists": True}}},
        {"$group": {"_id": "$responsavel.cpf", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ]))
    if dup_cpf:
        print(f"AVISO: {len(dup_cpf)} CPF(s) de responsável duplicado(s), índice NÃO criado: {dup_cpf}")
    elif not dry_run:
        db.companies.create_index(
            [("responsavel.cpf", ASCENDING)],
            unique=True,
            partialFilterExpression={"responsavel.cpf": {"$exists": True}},
            name="uniq_responsavel_cpf_partial",
        )
        print("Índice único (parcial) criado: companies.responsavel.cpf")
    else:
        print("(dry-run: sem duplicatas de responsavel.cpf, índice parcial seria criado)")

    if not dry_run:
        db.contas_pf.create_index([("cpf", ASCENDING)], unique=True, name="uniq_cpf")
        print("Índice único criado: contas_pf.cpf (coleção criada implicitamente se não existia)")
    else:
        print("(dry-run: índice contas_pf.cpf seria criado)")

    # 4. Garante existência das coleções (sem inserir documentos)
    existing = db.list_collection_names()
    for coll in ("contas_pf", "assinaturas"):
        if coll not in existing:
            if not dry_run:
                db.create_collection(coll)
            print(f"Coleção '{coll}' {'criada' if not dry_run else '(dry-run: seria criada)'}")
        else:
            print(f"Coleção '{coll}' já existe")

    print("=== Fim ===")


if __name__ == "__main__":
    main()
