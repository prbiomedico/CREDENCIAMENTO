"""Vincula o lote de PDFs padronizados às portarias históricas.

Uso (dentro do container, com MONGO_URL/DB_NAME já configurados):
  python migrations/2026_09_08_vincular_pdfs_portarias.py --source /tmp/lote --manifest /tmp/lote/MANIFESTO_RENOMEACAO.csv --dry-run
  python migrations/2026_09_08_vincular_pdfs_portarias.py --source /tmp/lote --manifest /tmp/lote/MANIFESTO_RENOMEACAO.csv --apply

O modo apply só começa depois de validar integralmente o lote e sempre grava
um manifesto de rollback. Arquivos anteriores não são removidos.
"""
import argparse
import csv
import hashlib
import json
import os
import shutil
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient


def norm(value):
    value = unicodedata.normalize("NFKD", value or "")
    return " ".join("".join(c for c in value if not unicodedata.combining(c)).casefold().split())


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_rows(manifest, source):
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    errors = []
    seen = set()
    for row in rows:
        path = source / row["nome_padronizado"]
        if row["nome_padronizado"] in seen:
            errors.append(f"nome duplicado: {row['nome_padronizado']}")
        seen.add(row["nome_padronizado"])
        if not path.is_file():
            errors.append(f"arquivo ausente: {path}")
        elif path.read_bytes()[:5] != b"%PDF-":
            errors.append(f"assinatura inválida: {path.name}")
        elif sha256(path) != row["sha256"]:
            errors.append(f"SHA-256 divergente: {path.name}")
    if errors:
        raise SystemExit("Validação falhou; nada alterado:\n- " + "\n- ".join(errors))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    rows = load_rows(args.manifest, args.source)
    spec_path = Path(__file__).resolve().parent.parent / "import_spec.json"
    specs = json.loads(spec_path.read_text(encoding="utf-8"))
    spec_by_file = {norm(item["arquivo_origem"]): item for item in specs}

    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    portarias = list(db.portarias.find({"deleted_at": None}, {"_id": 0}))
    by_title_uf = {}
    by_origin = {}
    for p in portarias:
        by_title_uf.setdefault((p.get("estado_sigla"), norm(p.get("title"))), []).append(p)
        if p.get("arquivo_origem_referencia"):
            by_origin.setdefault(norm(p["arquivo_origem_referencia"]), []).append(p)

    matches = []
    errors = []
    for row in rows:
        key = norm(row["nome_original"])
        spec = spec_by_file.get(key)
        candidates = by_origin.get(key, [])
        if not candidates and spec:
            candidates = by_title_uf.get((spec["uf"], norm(spec["titulo_sugerido"])), [])
        # Dois registros foram revisados depois da importação histórica.
        if not candidates and row["nome_padronizado"] == "SIGCR_DETRAN_RN_PORTARIA_651_2026.pdf":
            candidates = [p for p in portarias if p.get("portaria_id") == "port_f80832657d62"]
        if not candidates and row["nome_padronizado"] == "SIGCR_DETRAN_SP_EDITAL_DE_CREDENCIAMENTO_17_2026.pdf":
            candidates = [p for p in portarias if p.get("portaria_id") == "port_08af5c3feeaf"]
        if len(candidates) != 1:
            errors.append(f"{row['nome_padronizado']}: {len(candidates)} correspondências")
        else:
            matches.append((row, candidates[0]))

    ids = [p["portaria_id"] for _, p in matches]
    if len(set(ids)) != len(ids):
        errors.append("uma portaria foi associada a mais de um PDF")
    if len(rows) != 51:
        errors.append(f"lote deveria conter 51 PDFs, contém {len(rows)}")
    if errors:
        raise SystemExit("Correspondência falhou; nada alterado:\n- " + "\n- ".join(errors))

    print(f"Validação integral: {len(matches)}/{len(rows)} PDFs associados sem ambiguidade.")
    for row, portaria in matches:
        print(f"{portaria['portaria_id']} {portaria.get('estado_sigla')} -> {row['nome_padronizado']}")
    if args.dry_run:
        print("DRY RUN concluído; banco e uploads não foram alterados.")
        return

    now = datetime.now(timezone.utc).isoformat()
    upload_dir = Path("/app/uploads/portarias")
    backup_dir = Path("/app/uploads/rollback")
    upload_dir.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"portarias-pdfs-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup = [{"portaria_id": p["portaria_id"], "link_pdf_anterior": p.get("link_pdf"),
               "link_pdf_novo": f"/app/uploads/portarias/{row['nome_padronizado']}"}
              for row, p in matches]
    backup_path.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")

    notifications = 0
    for row, portaria in matches:
        target = upload_dir / row["nome_padronizado"]
        shutil.copy2(args.source / row["nome_padronizado"], target)
        link = str(target)
        db.portarias.update_one({"portaria_id": portaria["portaria_id"]}, {"$set": {
            "link_pdf": link, "updated_at": now, "arquivo_pdf_sha256": row["sha256"]}})
        db.auditoria.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}", "user_id": "sistema_importacao",
            "user_email": "sistema@sigcr.local", "user_name": "Importação controlada SIGCR",
            "acao": "vincular_pdf_portaria_lote", "entidade": "portaria",
            "entidade_id": portaria["portaria_id"], "detalhes": {
                "arquivo": row["nome_padronizado"], "sha256": row["sha256"],
                "link_anterior": portaria.get("link_pdf"), "manifesto_rollback": str(backup_path)},
            "ip": None, "atuando_como_empresa": None, "atuando_como_detran": None,
            "created_at": now})

        referenced = list(dict.fromkeys(portaria.get("empresas_referenciadas") or []))
        company_filter = {"tipo_empresa": "registradora", "deleted_at": None}
        if referenced:
            company_filter["company_id"] = {"$in": referenced}
        elif portaria.get("estado_sigla"):
            company_filter["detrans_atuacao"] = portaria["estado_sigla"]
        else:
            continue
        user_ids = {c.get("user_id") for c in db.companies.find(company_filter, {"user_id": 1}) if c.get("user_id")}
        for user_id in user_ids:
            db.notificacoes.insert_one({
                "notificacao_id": f"notif_{uuid.uuid4().hex[:12]}", "user_id": user_id,
                "tipo": "portaria_atualizada",
                "titulo": f"Portaria atualizada — DETRAN-{portaria.get('estado_sigla') or ''}",
                "mensagem": f"A Portaria {portaria.get('title') or portaria.get('numero') or ''} recebeu uma atualização.",
                "dados": {"portaria_id": portaria["portaria_id"], "estado_sigla": portaria.get("estado_sigla")},
                "lida": False, "created_at": now})
            notifications += 1

    print(f"APPLY concluído: {len(matches)} portarias, {notifications} notificações.")
    print(f"Rollback: {backup_path}")


if __name__ == "__main__":
    main()
