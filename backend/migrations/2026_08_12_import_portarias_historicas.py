"""
Importação em lote de portarias históricas de acervo (pedido do Pedro,
2026-08-12) — 58 portarias/editais/instruções/chamamentos públicos reais de
26 estados + DF, cadastradas como RASCUNHO enquanto o PDF de cada uma não é
anexado manualmente.

Lê backend/import_spec.json (formato: lista de
{arquivo_origem, uf, titulo_sugerido, tipo_sugerido}) e cria uma Portaria
pra cada item com:
  title=titulo_sugerido, estado_sigla=uf, tipo=tipo_sugerido,
  content="Importado de acervo histórico — aguardando revisão",
  source="Importação em lote", link_pdf=None (sem PDF ainda).

Campos extras gravados no documento (fora do modelo Pydantic atual, mas
inofensivos — Portaria usa extra="ignore" na leitura): criado_via
"importacao_manual" e arquivo_origem_referencia (nome do PDF original, só
como referência pro Pedro localizar o arquivo físico ao anexar depois).

Achado importante ANTES de rodar isto: o campo publicado_at que motivou o
pedido original NÃO existe no modelo Portaria em produção — não filtra nada
em lugar nenhum. GET /portarias hoje não tinha NENHUM controle de rascunho.
Corrigido junto com esta migração (mesmo commit): GET /portarias e
GET /portarias/{id} agora escondem de registradora/financeira qualquer
portaria com link_pdf vazio — é esse filtro, não publicado_at, que garante
que os 58 registros abaixo fiquem invisíveis pra esses dois perfis até o
Pedro anexar o PDF de cada um. sigcr_admin/detran/detran_admin continuam
vendo tudo (pra poder editar/revisar). Ver PENDING_ACTIONS.md.

Também acha, mas não decide por conta própria: o vocabulário de
tipo_sugerido (portaria/edital/instrucao/chamamento_publico, tipo de
INSTRUMENTO) não é o mesmo vocabulário do campo `tipo` que a tela
Portarias.js já usa hoje (credenciamento/descredenciamento/renovacao/
alteracao/outro, tipo de AÇÃO) — são eixos diferentes. Gravado como pedido
(tipo=tipo_sugerido) porque foi uma instrução explícita, mas o Select da
tela de edição não vai reconhecer o valor (vai aparecer em branco/sem
seleção) até o Pedro escolher uma das 5 opções existentes ao revisar cada
portaria.

`date` (campo obrigatório no modelo, sem equivalente em import_spec.json)
é preenchido com a data/hora da importação — placeholder, não a data real
do ato. Pedro deve corrigir ao revisar/anexar o PDF de cada portaria.

Idempotente: identifica registros já importados por
(criado_via="importacao_manual", title, estado_sigla) e pula quem já
existe — rodar de novo não duplica.

Uso:
    python3 migrations/2026_08_12_import_portarias_historicas.py [--dry-run] [--spec CAMINHO]

--dry-run mostra o que seria criado sem gravar nada.
--spec permite apontar pra um import_spec.json em outro caminho (default:
backend/import_spec.json, ao lado deste script).
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from pymongo import MongoClient

TIPOS_VALIDOS = {"portaria", "edital", "instrucao", "chamamento_publico"}
UF_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}


def main():
    dry_run = "--dry-run" in sys.argv

    spec_path = Path(__file__).resolve().parent.parent / "import_spec.json"
    if "--spec" in sys.argv:
        spec_path = Path(sys.argv[sys.argv.index("--spec") + 1])

    if not spec_path.exists():
        print(f"ERRO: {spec_path} não encontrado.")
        sys.exit(1)

    itens = json.loads(spec_path.read_text(encoding="utf-8"))
    print(f"{'[DRY RUN] ' if dry_run else ''}Lendo {spec_path} — {len(itens)} item(ns).")

    # Validação antes de tocar o banco — falha tudo ou nada, não importa
    # metade do lote com dado ruim no meio.
    erros = []
    for i, item in enumerate(itens):
        if item.get("uf") not in UF_VALIDAS:
            erros.append(f"  item {i} ({item.get('arquivo_origem')}): uf inválida '{item.get('uf')}'")
        if item.get("tipo_sugerido") not in TIPOS_VALIDOS:
            erros.append(f"  item {i} ({item.get('arquivo_origem')}): tipo_sugerido inválido '{item.get('tipo_sugerido')}'")
        if not item.get("titulo_sugerido"):
            erros.append(f"  item {i} ({item.get('arquivo_origem')}): titulo_sugerido vazio")
    if erros:
        print(f"ERRO: {len(erros)} item(ns) com dado inválido, nada foi importado:")
        for e in erros:
            print(e)
        sys.exit(1)

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]
    print(f"Conectado em {db_name}.")

    ja_importados = set(
        (d["title"], d["estado_sigla"])
        for d in db.portarias.find({"criado_via": "importacao_manual"}, {"_id": 0, "title": 1, "estado_sigla": 1})
    )

    agora = datetime.now(timezone.utc)
    criados = []
    pulados = []
    for item in itens:
        chave = (item["titulo_sugerido"], item["uf"])
        if chave in ja_importados:
            pulados.append(item)
            continue

        doc = {
            "portaria_id": f"port_{os.urandom(6).hex()}",
            "title": item["titulo_sugerido"],
            "content": "Importado de acervo histórico — aguardando revisão",
            "source": "Importação em lote",
            "date": agora.isoformat(),
            "detran": item["uf"],
            "summary": None,
            "numero": None,
            "orgao_emissor": None,
            "estado_sigla": item["uf"],
            "status": "vigente",
            "link_pdf": None,
            "origem": "manual",
            "querido_diario_url": None,
            "tipo": item["tipo_sugerido"],
            "empresas_referenciadas": [],
            "checklist_itens": [],
            "created_by": None,
            "updated_at": None,
            "deleted_at": None,
            "deleted_by": None,
            "created_at": agora.isoformat(),
            # Campos extras, fora do modelo Pydantic atual (extra="ignore" —
            # não quebra leitura via API, só não aparece na resposta serializada):
            "criado_via": "importacao_manual",
            "arquivo_origem_referencia": item["arquivo_origem"],
        }
        criados.append(doc)
        if not dry_run:
            db.portarias.insert_one(doc)

    print(f"\n{len(criados)} portaria(s) {'seriam criadas' if dry_run else 'criadas'}:")
    for d in criados:
        print(f"  [{d['estado_sigla']}] {d['title']} (tipo={d['tipo']})")

    if pulados:
        print(f"\n{len(pulados)} item(ns) já importado(s) antes, pulado(s):")
        for item in pulados:
            print(f"  [{item['uf']}] {item['titulo_sugerido']}")

    print("\nConcluído." + (" (nada foi gravado — --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
