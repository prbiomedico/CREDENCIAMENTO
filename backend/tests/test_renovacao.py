from datetime import date
from renovacao import janela_renovacao

def test_limites_da_janela():
    cred = {'status': 'ativo', 'validade': '2027-04-15T23:59:59+00:00'}
    assert janela_renovacao(cred, date(2027,2,13))['disponivel'] is False
    assert janela_renovacao(cred, date(2027,2,14))['disponivel'] is True
    assert janela_renovacao(cred, date(2027,4,15))['disponivel'] is True
    assert janela_renovacao(cred, date(2027,4,16))['disponivel'] is False

def test_sem_data_inativo_e_ano_bissexto():
    assert not janela_renovacao({'status':'ativo'})['disponivel']
    assert not janela_renovacao({'status':'sem_efeito','validade':'2027-04-15'}, date(2027,4,1))['disponivel']
    assert janela_renovacao({'status':'ativo','validade':'2028-03-15'}, date(2028,1,15))['abre_em'] == '2028-01-15'
