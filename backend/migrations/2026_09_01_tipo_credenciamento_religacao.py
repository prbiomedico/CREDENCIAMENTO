"""
Fatia 2 do modelo Credencia-CE (investigação Fase 1 aprovada por Pedro, ver
PENDING_ACTIONS.md): religa checklist/submissão pro catálogo
TipoCredenciamento (Fatia 1). Este script só cuida do dado que precisa de
backfill retroativo.

Único backfill necessário: `db.credenciamentos` (CredenciamentoDetalhes)
ganhou o campo `categoria` nesta fatia — a chave de unicidade de negócio do
credenciamento passa a ser (company_id, estado_sigla, categoria), não mais
só (company_id, estado_sigla), pra uma empresa poder ter credenciamentos
distintos na mesma UF em categorias diferentes. Os credenciamentos criados
antes desta fatia não têm esse campo; sem o backfill, `homologar_submissao`
não encontraria o registro existente na próxima homologação/renovação
daquela UF e criaria um duplicado em vez de atualizar o original.

Nenhum outro dado precisa de migração nesta fatia: PortariaChecklistItem,
SubmissaoItem.perfil_alvo e Submissao.perfil_empresa já eram strings
"registradora"/"financeira" em produção — o Pydantic mudou de
Literal["registradora","financeira"] pra `str` (validado em runtime contra
o catálogo em vez de travado em tempo de tipo), mas o VALOR armazenado no
Mongo não muda; "registradora"/"financeira" já são tipo_id válidos no
catálogo (semeados pela migração da Fatia 1).

Backfill: cada credenciamento sem `categoria` recebe o tipo_empresa da
empresa dona dele (os 22 credenciamentos reais em produção nesta data são
todos company_hdregistros/registradora, mas o script generaliza pra
qualquer empresa/tipo).

Idempotente: credenciamento que já tem o campo `categoria` é pulado.

Uso:
    cd backend && python3 migrations/2026_09_01_tipo_credenciamento_religacao.py [--dry-run]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient


def main():
    dry_run = "--dry-run" in sys.argv
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    sem_categoria = list(db.credenciamentos.find({"categoria": {"$exists": False}}, {"_id": 0}))
    print(f"\n{len(sem_categoria)} credenciamento(s) sem campo 'categoria'.")

    revisar_manual = []
    for cred in sem_categoria:
        company = db.companies.find_one(
            {"company_id": cred["company_id"]}, {"_id": 0, "tipo_empresa": 1, "nome_fantasia": 1}
        )
        categoria = (company or {}).get("tipo_empresa")
        if not categoria:
            revisar_manual.append(cred["credenciamento_id"])
            print(f"  ! {cred['credenciamento_id']} ({cred['company_id']}/{cred['estado_sigla']}): "
                  f"empresa não encontrada ou sem tipo_empresa -- pulando, revisar manualmente")
            continue
        print(f"  {cred['credenciamento_id']} ({(company or {}).get('nome_fantasia', '?')}/{cred['estado_sigla']}): categoria={categoria}")
        if not dry_run:
            db.credenciamentos.update_one(
                {"credenciamento_id": cred["credenciamento_id"]}, {"$set": {"categoria": categoria}}
            )

    if revisar_manual:
        print(f"\n{len(revisar_manual)} credenciamento(s) precisam de revisão manual (empresa não encontrada): {revisar_manual}")

    print("\nConcluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
