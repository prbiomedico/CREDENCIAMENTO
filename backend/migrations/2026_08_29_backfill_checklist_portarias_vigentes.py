"""
Backfill pedido pelo Pedro, 2026-08-29 (depois do item 55, que só trocou o
catálogo reutilizável sem tocar nenhuma portaria existente): aplica o
catálogo novo de 43 itens (31 registradora/CONTRAN 807 + 12 financeira/Edital
DETRAN-DF 003/2022, já vivo em db.checklist_catalogo_portaria desde o item
55) como checklist_itens da portaria vigente de cada UF real — 26 das 27 UFs
(PA fica de fora, ver abaixo).

Decisões (todas do Pedro, nenhuma decidida aqui):
  - 12 UFs com 1 única portaria: aplica direto.
  - 11 UFs com mais de 1 candidata: usa a mais recente por número/ano no
    título (maior ano; empate de ano desempata pelo maior número).
  - SE: aplica na 310-2025 (portaria de SUSPENSÃO de novos credenciamentos),
    seguindo a regra padrão de "mais recente" mesmo sendo suspensão — Pedro
    decide depois com o DETRAN-SE se isso deveria bloquear inscrição.
  - PA: nenhuma das 2 portarias existentes (2930-2012 registro de contrato;
    taxas/extrato termo aditivo) é sobre credenciamento -- fora do backfill,
    sinalizado como pendência separada em PENDING_ACTIONS.md.
  - RN: confirmado via pdftotext no PDF real (port_f80832657d62, 5 páginas,
    Diário Oficial do RN) que o ato é a "PORTARIA 651/2026 -GADIR" --
    idêntico à duplicata importada port_ea5e8364a2a0 ("PORTARIA 651-2026").
    Mantém a real (com PDF), remove (soft-delete) a duplicata. As outras 2
    (308-2021, Edital 06-2026) são atos genuinamente diferentes, não tocadas.
  - SP: confirmado via pdftotext (port_08af5c3feeaf) que o PDF é o "EDITAL DE
    CREDENCIAMENTO Nº 17, DE 27 DE ABRIL DE 2026" -- idêntico à duplicata
    importada port_969354f40e27. Mantém a real (com PDF), remove a duplicata.

Cada checklist_itens é um snapshot independente (PortariaChecklistItem já
funciona assim, ver server.py) -- os item_id (pci_*) são gerados na hora,
catalogo_item_id aponta pro item do catálogo pra rastreabilidade, mas o
snapshot embutido na portaria não muda retroativamente se o catálogo for
editado depois.

Idempotente: uma portaria cujo checklist_itens já tem >=1 item com
catalogo_item_id de um item ativo do catálogo atual é pulada (já rodou).
Soft-deletes idempotentes: só marca deleted_at se ainda não estiver deletada.

Uso:
    cd backend && python3 migrations/2026_08_29_backfill_checklist_portarias_vigentes.py [--dry-run]
"""
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient

ADMIN_USER_ID = "cf4294d2-b592-40e1-807b-ed0d05304713"  # administrador@sigcr.com.br (sigcr_admin)

# UF -> portaria_id vigente escolhida (26 UFs; PA fora, ver docstring)
VIGENTE_POR_UF = {
    "AC": "port_945b19d12524",
    "AL": "port_e566092c8b10",  # PORTARIA 2738-2024 -- maior número, único ano (2024)
    "AM": "port_43c9af6a0fb9",
    "AP": "port_e775df6b6b90",
    "BA": "port_9fb235a9a621",  # PORTARIA 169-2024 -- ano mais recente (2024 > 2023)
    "CE": "port_c9d21fadf1b0",  # PORTARIA 172-2026 -- ano mais recente (2026), altera a 1452-2025
    "DF": "port_24fa40d61837",  # INSTRUÇÃO 199-2026 -- ano mais recente (2026 > 2025)
    "ES": "port_e178df6b3c08",
    "GO": "port_2ac0a55ec712",
    "MA": "port_54f112bc179e",  # EDITAL 01-2026 (Agente Financeiro) -- ano mais recente (2026)
    "MG": "port_115b55d8176d",
    "MS": "port_bcba978b6d67",
    "MT": "port_bb9cd55b042b",  # PORTARIA 162-2026 -- maior número em 2026, altera a 79-2026
    # PA: fora do backfill -- ver docstring / PENDING_ACTIONS.md
    "PB": "port_9c5a05a3963e",
    "PE": "port_50195d92561e",  # EDITAL 15-2026 -- ano mais recente (2026)
    "PI": "port_6b6d0c5fc15e",
    "PR": "port_5e7d7c1e0d51",  # PORTARIA 409-2023 -- única com número/ano identificável
    "RJ": "port_e17cd3883aa5",
    "RN": "port_f80832657d62",  # a real, com PDF (Portaria 651/2026-GADIR) -- ver dedup abaixo
    "RO": "port_2ddaab9790d0",  # PORTARIA 1098-2025 -- ano mais recente entre as com número/ano
    "RR": "port_b1be43a02b28",
    "RS": "port_08dba979ee1d",  # PORTARIA 028-2026 -- maior número em 2026
    "SC": "port_ba62c1f8f187",  # PORTARIA 09-2026 -- ano mais recente (2026 > 2018)
    "SE": "port_1a4f733c7112",  # PORTARIA 310-2025 -- suspensão, decisão explícita do Pedro
    "SP": "port_08af5c3feeaf",  # a real, com PDF (Edital 17/2026) -- ver dedup abaixo
    "TO": "port_dc0df3cbf29c",
}

# Duplicatas confirmadas via leitura do PDF real -- soft-delete, nunca hard-delete
DUPLICATAS_PARA_REMOVER = {
    "port_ea5e8364a2a0": "RN -- 'PORTARIA 651-2026' importada, confirmado ser o mesmo ato do PDF real port_f80832657d62 (Portaria DETRAN nº 651/2026-GADIR)",
    "port_969354f40e27": "SP -- 'EDITAL DE CREDENCIAMENTO 17-2026' importada, confirmado ser o mesmo ato do PDF real port_08af5c3feeaf (Edital nº 17, de 27 de abril de 2026)",
}


def montar_snapshot_checklist(catalogo_ativo):
    agora = datetime.now(timezone.utc).isoformat()
    return [
        {
            "item_id": f"pci_{uuid.uuid4().hex[:8]}",
            "nome": item["nome"],
            "descricao": item.get("descricao"),
            "perfil_alvo": item["perfil_alvo"],
            "catalogo_item_id": item["item_id"],
        }
        for item in catalogo_ativo
    ], agora


def main():
    dry_run = "--dry-run" in sys.argv
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]

    print(f"{'[DRY RUN] ' if dry_run else ''}Conectado em {db_name}")

    catalogo_ativo = list(db.checklist_catalogo_portaria.find({"ativo": True}, {"_id": 0}))
    ids_catalogo_ativo = {i["item_id"] for i in catalogo_ativo}
    print(f"Catálogo ativo: {len(catalogo_ativo)} itens "
          f"({sum(1 for i in catalogo_ativo if i['perfil_alvo']=='registradora')} registradora, "
          f"{sum(1 for i in catalogo_ativo if i['perfil_alvo']=='financeira')} financeira)")
    assert len(catalogo_ativo) == 43, f"esperava 43 itens ativos no catálogo, achou {len(catalogo_ativo)}"

    # --- 1. Dedup RN/SP ---
    print(f"\n--- Removendo {len(DUPLICATAS_PARA_REMOVER)} duplicata(s) confirmada(s) ---")
    for portaria_id, motivo in DUPLICATAS_PARA_REMOVER.items():
        doc = db.portarias.find_one({"portaria_id": portaria_id})
        if not doc:
            print(f"  ! {portaria_id} não encontrada -- pulando")
            continue
        if doc.get("deleted_at"):
            print(f"  = {portaria_id} já removida anteriormente (idempotente)")
            continue
        em_uso = db.submissoes.find_one({"portaria_id": portaria_id})
        if em_uso:
            print(f"  ! {portaria_id} tem submissões -- NÃO removendo (revogar em vez de excluir)")
            continue
        print(f"  - {portaria_id}: {motivo}")
        if not dry_run:
            db.portarias.update_one(
                {"portaria_id": portaria_id},
                {"$set": {
                    "deleted_at": datetime.now(timezone.utc).isoformat(),
                    "deleted_by": ADMIN_USER_ID,
                }},
            )

    # --- 2. Backfill checklist_itens ---
    print(f"\n--- Aplicando checklist novo em {len(VIGENTE_POR_UF)} UFs (PA fora) ---")
    aplicadas, puladas = 0, 0
    for uf, portaria_id in sorted(VIGENTE_POR_UF.items()):
        doc = db.portarias.find_one({"portaria_id": portaria_id, "deleted_at": None})
        if not doc:
            print(f"  ! {uf} ({portaria_id}) não encontrada ou removida -- pulando")
            continue
        ja_aplicado = any(
            i.get("catalogo_item_id") in ids_catalogo_ativo for i in (doc.get("checklist_itens") or [])
        )
        if ja_aplicado:
            print(f"  = {uf}: já tem o checklist novo aplicado (idempotente)")
            puladas += 1
            continue
        snapshot, agora = montar_snapshot_checklist(catalogo_ativo)
        print(f"  + {uf} ({portaria_id}): {doc['title'][:70]!r} -- {len(snapshot)} itens")
        if not dry_run:
            db.portarias.update_one(
                {"portaria_id": portaria_id},
                {"$set": {"checklist_itens": snapshot, "updated_at": agora}},
            )
        aplicadas += 1

    print(f"\n{aplicadas} portaria(s) atualizada(s), {puladas} já estavam prontas.")
    print("Concluído." + (" (nada foi gravado -- --dry-run)" if dry_run else ""))
    client.close()


if __name__ == "__main__":
    main()
