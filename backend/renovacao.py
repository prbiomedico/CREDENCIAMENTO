"""Janela operacional do SIGCR; não substitui prazos previstos pelo órgão."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def janela_renovacao(credenciamento, hoje=None):
    hoje = hoje or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    try:
        valor = credenciamento.get('validade')
        validade = valor.date() if isinstance(valor, datetime) else date.fromisoformat(str(valor)[:10])
    except (ValueError, TypeError):
        return {'disponivel': False, 'abre_em': None, 'validade': None, 'motivo': 'Validade não informada; solicite a conferência do cadastro.'}
    abre = validade - timedelta(days=60)
    ativo = credenciamento.get('status') == 'ativo' and not credenciamento.get('deleted_at')
    disponivel = ativo and abre <= hoje <= validade
    motivo = ('Credenciamento não está ativo.' if not ativo else
              'Credenciamento vencido; solicite orientação ao DETRAN.' if hoje > validade else
              f'Renovação disponível a partir de {abre.strftime("%d/%m/%Y")}.' if hoje < abre else
              'Renovação disponível nos 60 dias anteriores ao vencimento.')
    return {'disponivel': disponivel, 'abre_em': abre.isoformat(), 'validade': validade.isoformat(), 'motivo': motivo}
