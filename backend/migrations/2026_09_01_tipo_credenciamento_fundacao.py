"""
Fatia 1 do modelo Credencia-CE (investigação Fase 1 aprovada por Pedro, ver
PENDING_ACTIONS.md): cria o catálogo `tipos_credenciamento` e faz backfill de
`companies.categorias_credenciamento` — fundação puramente aditiva, nenhum
consumidor ainda lê nenhum dos dois campos (isso é trabalho da Fatia 2).

Semeia exatamente 2 registros no catálogo, com tipo_id FIXO (não gerado
aleatoriamente) igual ao valor literal que `Company.tipo_empresa` e todo
`perfil_alvo`/`perfil_empresa` já usam em produção hoje:

  - tipo_id="registradora", exige_vinculo_com=None
  - tipo_id="financeira",   exige_vinculo_com="registradora"

`exige_vinculo_com="registradora"` modela como DADO a regra que hoje é
hardcoded em `_validar_tipo_e_vinculo_empresa` (financeira exige uma
registradora com contrato ativo) — decisão B1 da Fase 1: categorias novas
nascem independentes por padrão, só quem setar esse campo explicitamente
herda esse tipo de exigência. tipo_id fixo (em vez do default_factory
aleatório do modelo) é o que permite que todo dado já existente
(companies.tipo_empresa="registradora"/"financeira", e futuramente
perfil_alvo nos 4 modelos da Fatia 2) continue válido contra o catálogo sem
precisar de nenhum rename.

Backfill: toda company sem `categorias_credenciamento` preenchido recebe
`[tipo_empresa]` — preserva 1:1 o que a empresa já tinha, só populando o
eixo novo. Companies com tipo_empresa fora de {registradora, financeira}
(nenhuma encontrada em produção nesta checagem, mas o script trata o caso)
recebem `categorias_credenciamento=[]` em vez de inventar uma categoria não
semeada no catálogo.

Idempotente: reinserir um tipo_id já existente é no-op; companies que já
têm categorias_credenciamento não-vazio são puladas.

Uso:
    cd backend && python3 migrations/2026_09_01_tipo_credenciamento_fundacao.py [--dry-run]
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient

TIPOS_SEED = [
    {"tipo_id": "registradora", "nome": "Registradora", "descricao": "Registradora de contratos — Resolução CONTRAN 807.", "exige_vinculo_com": None},
    {"tipo_id": "financeira", "nome": "Financeira", "descricao": "Agente arrecadador — Edital DETRAN-DF nº 003/2022.", "exige_vinculo_com": "registradora"},
]

CATEGORIAS_VALIDAS = {t["tipo_id"] for t in TIPOS_SEED}


def main():
    dry_run = "--dry-run" in sys.argv
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    # ---- 1. Catálogo tipos_credenciamento ----
    ja_existentes = set(
        d["tipo_id"] for d in db.tipos_credenciamento.find(
            {"tipo_id": {"$in": list(CATEGORIAS_VALIDAS)}}, {"_id": 0, "tipo_id": 1}
        )
    )
    a_inserir = [t for t in TIPOS_SEED if t["tipo_id"] not in ja_existentes]
    print(f"\ntipos_credenciamento: {len(ja_existentes)} já presentes (idempotente, não re-inseridos); {len(a_inserir)} a inserir.")
    agora = datetime.now(timezone.utc).isoformat()
    for tipo in a_inserir:
        doc = {**tipo, "ativo": True, "created_by": None, "created_at": agora}
        print(f"  + {doc['tipo_id']}: {doc['nome']} (exige_vinculo_com={doc['exige_vinculo_com']})")
        if not dry_run:
            db.tipos_credenciamento.insert_one(doc)

    # ---- 2. Backfill companies.categorias_credenciamento ----
    companies = list(db.companies.find({"deleted_at": None}, {"_id": 0, "company_id": 1, "nome_fantasia": 1, "tipo_empresa": 1, "categorias_credenciamento": 1}))
    print(f"\n{len(companies)} empresa(s) ativa(s) encontrada(s).")
    a_atualizar = [c for c in companies if not c.get("categorias_credenciamento")]
    print(f"{len(companies) - len(a_atualizar)} já têm categorias_credenciamento preenchido (pulando); {len(a_atualizar)} a preencher.")
    for c in a_atualizar:
        tipo_empresa = c.get("tipo_empresa")
        categorias = [tipo_empresa] if tipo_empresa in CATEGORIAS_VALIDAS else []
        aviso = "" if categorias else f" [tipo_empresa={tipo_empresa!r} não está no catálogo semeado — categorias_credenciamento fica vazio, revisar manualmente]"
        print(f"  {c['company_id']} ({c.get('nome_fantasia', '?')}): tipo_empresa={tipo_empresa!r} -> categorias_credenciamento={categorias}{aviso}")
        if not dry_run:
            db.companies.update_one({"company_id": c["company_id"]}, {"$set": {"categorias_credenciamento": categorias}})

    print("\nConcluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
