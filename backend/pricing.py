"""Precificação autoritativa do serviço gerenciado SIGCR.

Valores em centavos. O navegador informa somente quantidade/período; qualquer
cobrança futura deve recalcular estes valores no backend.
"""

BASE_MENSAL_CENTAVOS = 299_000
IMPLANTACAO_BASE_CENTAVOS = 690_000
IMPLANTACAO_POR_UF_CENTAVOS = 120_000
DESCONTO_ANUAL_PERCENTUAL = 10

FAIXAS_UF = (
    (1, 1, 150_000),
    (2, 5, 110_000),
    (6, 10, 86_000),
    (11, 20, 65_000),
    (21, 27, 45_714),
)


def _validar_quantidade(quantidade_ufs: int) -> None:
    if isinstance(quantidade_ufs, bool) or not isinstance(quantidade_ufs, int):
        raise ValueError("quantidade_ufs deve ser um número inteiro")
    if quantidade_ufs < 1 or quantidade_ufs > 27:
        raise ValueError("quantidade_ufs deve estar entre 1 e 27")


def calcular_mensalidade_centavos(quantidade_ufs: int) -> int:
    _validar_quantidade(quantidade_ufs)
    total = BASE_MENSAL_CENTAVOS
    for inicio, fim, valor in FAIXAS_UF:
        unidades = max(0, min(quantidade_ufs, fim) - inicio + 1)
        total += unidades * valor
    # Comercialmente exibimos valores em reais inteiros; o arredondamento
    # também mantém o plano nacional no preço aprovado de R$ 22.890.
    return round(total / 100) * 100


def calcular_precificacao(quantidade_ufs: int, periodo: str = "mensal") -> dict:
    _validar_quantidade(quantidade_ufs)
    if periodo not in {"mensal", "anual"}:
        raise ValueError("periodo deve ser 'mensal' ou 'anual'")

    mensal = calcular_mensalidade_centavos(quantidade_ufs)
    anual_sem_desconto = mensal * 12
    anual = anual_sem_desconto * (100 - DESCONTO_ANUAL_PERCENTUAL) // 100
    recorrencia = mensal if periodo == "mensal" else anual
    implantacao = IMPLANTACAO_BASE_CENTAVOS + quantidade_ufs * IMPLANTACAO_POR_UF_CENTAVOS
    return {
        "quantidade_ufs": quantidade_ufs,
        "periodo": periodo,
        "mensalidade_centavos": mensal,
        "recorrencia_centavos": recorrencia,
        "implantacao_centavos": implantacao,
        "desconto_anual_percentual": DESCONTO_ANUAL_PERCENTUAL,
        "moeda": "BRL",
    }
