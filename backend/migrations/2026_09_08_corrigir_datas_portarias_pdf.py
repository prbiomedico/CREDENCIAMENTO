"""Corrige as datas-placeholder do lote de 51 portarias a partir dos PDFs.

As datas abaixo são as datas do próprio ato quando o cabeçalho/assinatura é
legível. Nos poucos editais sem data formal no corpo, usa-se a publicação ou
a criação oficial do arquivo, explicitada em DATA_SOURCE.
"""
import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient


DATES = {
    "SIGCR_DETRAN_AC_PORTARIA_213_2022.pdf": "2022-03-29",
    "SIGCR_DETRAN_AL_PORTARIA_2738_2024.pdf": "2024-11-21",
    "SIGCR_DETRAN_AL_PORTARIA_315_2024.pdf": "2024-02-16",
    "SIGCR_DETRAN_AL_PORTARIA_503_2024.pdf": "2024-03-07",
    "SIGCR_DETRAN_AP_PORTARIA_325_2023.pdf": "2023-08-11",
    "SIGCR_DETRAN_BA_EDITAL_DE_CREDENCIAMENTO_003_2023.pdf": "2023-12-14",
    "SIGCR_DETRAN_BA_PORTARIA_169_2024.pdf": "2024-03-28",
    "SIGCR_DETRAN_DF_INSTRUCAO_1403_2025.pdf": "2025-10-13",
    "SIGCR_DETRAN_DF_INSTRUCAO_199_2026.pdf": "2026-06-02",
    "SIGCR_DETRAN_DF_INSTRUCAO_629_2025.pdf": "2025-06-05",
    "SIGCR_DETRAN_ES_EDITAL_DE_CREDENCIAMENTO_001_2025.pdf": "2025-09-29",
    "SIGCR_DETRAN_GO_PORTARIA_221_2019.pdf": "2019-03-28",
    "SIGCR_DETRAN_MG_PORTARIA_987_2021.pdf": "2021-10-21",
    "SIGCR_DETRAN_MS_PORTARIA_159_2023.pdf": "2023-12-01",
    "SIGCR_DETRAN_MT_PORTARIA_079_2026.pdf": "2026-02-20",
    "SIGCR_DETRAN_MT_PORTARIA_080_2026.pdf": "2026-02-20",
    "SIGCR_DETRAN_MT_PORTARIA_162_2026.pdf": "2026-03-23",
    "SIGCR_DETRAN_MT_PORTARIA_803_2019.pdf": "2019-09-24",
    "SIGCR_DETRAN_PA_EXTRATO_TERMO_ADITIVO_01_2025.pdf": "2025-11-04",
    "SIGCR_DETRAN_PA_PORTARIA_2930_2012.pdf": "2012-09-06",
    "SIGCR_DETRAN_PB_PORTARIA_444_2022.pdf": "2022-12-20",
    "SIGCR_DETRAN_PE_EDITAL_DE_CREDENCIAMENTO_15_2026.pdf": "2026-08-07",
    "SIGCR_DETRAN_PE_EDITAL_DE_CREDENCIAMENTO_4056_2025_0027.pdf": "2026-03-13",
    "SIGCR_DETRAN_PE_PORTARIA_2756_2020.pdf": "2020-10-30",
    "SIGCR_DETRAN_PE_PORTARIA_4232_2025.pdf": "2025-05-22",
    "SIGCR_DETRAN_PI_PORTARIA_227_2025.pdf": "2025-11-19",
    "SIGCR_DETRAN_PR_PORTARIA_409_2023.pdf": "2023-03-23",
    "SIGCR_DETRAN_PR_PORTARIA_749_2023.pdf": "2024-03-22",
    "SIGCR_DETRAN_RJ_PORTARIA_6981_2025.pdf": "2025-09-09",
    "SIGCR_DETRAN_RN_EDITAL_DE_CREDENCIAMENTO_06_2026.pdf": "2026-07-31",
    "SIGCR_DETRAN_RN_PORTARIA_308_2021.pdf": "2021-05-17",
    "SIGCR_DETRAN_RN_PORTARIA_651_2026.pdf": "2026-07-31",
    "SIGCR_DETRAN_RO_EDITAL_DE_CREDENCIAMENTO_50_2025.pdf": "2025-12-17",
    "SIGCR_DETRAN_RO_PORTARIA_1098_2025.pdf": "2025-06-10",
    "SIGCR_DETRAN_RO_PORTARIA_500_2021.pdf": "2021-04-13",
    "SIGCR_DETRAN_RR_PORTARIA_35_2024.pdf": "2024-01-22",
    "SIGCR_DETRAN_RS_PORTARIA_019_2026.pdf": "2026-01-13",
    "SIGCR_DETRAN_RS_PORTARIA_028_2026.pdf": "2026-01-16",
    "SIGCR_DETRAN_RS_PORTARIA_556_2025.pdf": "2025-12-19",
    "SIGCR_DETRAN_RS_PORTARIA_557_2025.pdf": "2025-12-19",
    "SIGCR_DETRAN_SC_PORTARIA_09_2026.pdf": "2026-06-09",
    "SIGCR_DETRAN_SC_PORTARIA_76_2018.pdf": "2018-03-21",
    "SIGCR_DETRAN_SE_PORTARIA_219_2023.pdf": "2023-05-02",
    "SIGCR_DETRAN_SE_PORTARIA_294_2025.pdf": "2025-05-02",
    "SIGCR_DETRAN_SE_PORTARIA_295_2025.pdf": "2025-05-02",
    "SIGCR_DETRAN_SE_PORTARIA_310_2025.pdf": "2025-05-12",
    "SIGCR_DETRAN_SP_EDITAL_DE_CREDENCIAMENTO_17_2026.pdf": "2026-04-27",
    "SIGCR_DETRAN_SP_PORTARIA_76_2021.pdf": "2021-03-23",
    "SIGCR_DETRAN_SP_PORTARIA_NORMATIVA_41_2025.pdf": "2025-04-15",
    "SIGCR_DETRAN_TO_CHAMAMENTO_PUBLICO_4_2025.pdf": "2025-03-06",
    "SIGCR_PORTARIA_NORMATIVA_004_2019.pdf": "2019-07-23",
}


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    docs = list(db.portarias.find({"arquivo_pdf_sha256": {"$exists": True}, "deleted_at": None}, {"_id": 0}))
    by_name = {Path(doc["link_pdf"]).name: doc for doc in docs}
    missing = sorted(set(DATES) - set(by_name))
    extra = sorted(set(by_name) - set(DATES))
    if len(DATES) != 51 or missing or extra:
        raise SystemExit(f"Validação falhou: mapa={len(DATES)}, ausentes={missing}, extras={extra}")
    targets = {
        name: doc for name, doc in by_name.items()
        if str(doc.get("date") or "").startswith("2026-08-12")
    }
    print(f"Validação integral: {len(docs)}/51 associadas; {len(targets)} ainda possuem data-placeholder.")
    for name, date in DATES.items():
        if name not in targets:
            continue
        print(f"{by_name[name]['portaria_id']} {by_name[name].get('date')} -> {date} ({name})")
    if args.dry_run:
        print("DRY RUN concluído; nada alterado.")
        return

    now = datetime.now(timezone.utc).isoformat()
    backup_dir = Path("/app/uploads/rollback")
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"portarias-datas-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    backup_path.write_text(json.dumps([
        {"portaria_id": doc["portaria_id"], "arquivo": name,
         "date_anterior": doc.get("date"), "date_nova": DATES[name]}
        for name, doc in targets.items()
    ], ensure_ascii=False, indent=2), encoding="utf-8")

    for name, date in DATES.items():
        if name not in targets:
            continue
        doc = by_name[name]
        iso_date = f"{date}T00:00:00+00:00"
        db.portarias.update_one({"portaria_id": doc["portaria_id"]}, {"$set": {
            "date": iso_date, "data_documento_fonte": "pdf_oficial",
            "updated_at": now}})
        db.auditoria.insert_one({
            "log_id": f"log_{uuid.uuid4().hex[:12]}", "user_id": "sistema_importacao",
            "user_email": "sistema@sigcr.local", "user_name": "Correção controlada SIGCR",
            "acao": "corrigir_data_portaria_pdf", "entidade": "portaria",
            "entidade_id": doc["portaria_id"], "detalhes": {
                "arquivo": name, "date_anterior": doc.get("date"), "date_nova": iso_date,
                "fonte": "pdf_oficial", "manifesto_rollback": str(backup_path)},
            "ip": None, "atuando_como_empresa": None, "atuando_como_detran": None,
            "created_at": now})
    print(f"APPLY concluído: {len(targets)} datas-placeholder corrigidas; {51 - len(targets)} datas revisadas preservadas. Rollback: {backup_path}")


if __name__ == "__main__":
    main()
