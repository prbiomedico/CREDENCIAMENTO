"""
Corrige a race condition de upsert em get_current_user (achada em 2026-08-01
durante o diagnóstico do bug "Nenhuma empresa cadastrada"/"Erro ao cadastrar
empresa" do usuário hdregistros — o duplicado em si não era a causa raiz
daquele bug, mas foi encontrado no caminho e é um problema real separado).

O que faz:
1. Agrupa users por user_id, encontra duplicatas.
2. Para cada grupo duplicado, mantém o documento com o created_at mais antigo
   e remove os demais (nunca apaga sem antes listar o que vai manter/remover).
3. Cria um índice único em users.user_id — só tenta depois de confirmar que
   não sobrou nenhuma duplicata, pra não falhar/mascarar dado ruim.

Idempotente: rodar de novo com o índice já existindo e sem duplicatas não
faz nada além de confirmar que está tudo certo.

Uso:
    python3 migrations/2026_08_01_fix_users_upsert_race.py [--dry-run]

--dry-run mostra o que seria feito sem gravar nada.
"""
import os
import sys
from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError


def main():
    dry_run = "--dry-run" in sys.argv

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    # 1) Encontrar duplicatas
    duplicatas = list(db.users.aggregate([
        {"$group": {
            "_id": "$user_id",
            "count": {"$sum": 1},
            "docs": {"$push": {"_id": "$_id", "created_at": "$created_at", "email": "$email"}},
        }},
        {"$match": {"count": {"$gt": 1}}},
    ]))

    if not duplicatas:
        print("Nenhuma duplicata em users.user_id.")
    else:
        print(f"{len(duplicatas)} user_id(s) duplicado(s) encontrado(s):")
        for grupo in duplicatas:
            docs_ordenados = sorted(grupo["docs"], key=lambda d: d.get("created_at") or "")
            manter = docs_ordenados[0]
            remover = docs_ordenados[1:]
            print(f"  user_id={grupo['_id']} email={manter.get('email')}")
            print(f"    MANTÉM _id={manter['_id']} created_at={manter.get('created_at')}")
            for r in remover:
                print(f"    REMOVE _id={r['_id']} created_at={r.get('created_at')}")
            if not dry_run:
                ids_remover = [r["_id"] for r in remover]
                result = db.users.delete_many({"_id": {"$in": ids_remover}})
                print(f"    -> {result.deleted_count} documento(s) removido(s)")

    # 2) Índice único — só cria se não houver mais duplicata (real ou por não ter rodado o passo acima em dry-run)
    duplicatas_restantes = list(db.users.aggregate([
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ]))
    if duplicatas_restantes:
        print(f"AINDA há {len(duplicatas_restantes)} duplicata(s) — índice único NÃO criado"
              + (" (esperado em --dry-run)" if dry_run else " (algo deu errado na remoção acima)"))
    elif dry_run:
        print("[DRY RUN] Índice único em user_id seria criado agora.")
    else:
        db.users.create_index([("user_id", ASCENDING)], unique=True, name="uniq_user_id")
        print("Índice único uniq_user_id criado em users.user_id.")

    print("Concluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))


if __name__ == "__main__":
    main()
