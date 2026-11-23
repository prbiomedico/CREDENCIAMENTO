"""Internal-only preventive notices; no mail, no legal deadline inference."""
from datetime import date,datetime,timezone
from zoneinfo import ZoneInfo
import hashlib

def iso_date(value):
 if isinstance(value,datetime):return value.date()
 return date.fromisoformat(str(value)[:10])

def latest_due(control,today):
 if not control.get('vencimento'):return None
 expiry=iso_date(control['vencimento'])
 if today>expiry:return None
 due=[a for a in control.get('alertas_preventivos',[]) if iso_date(a['data'])<=today]
 return max(due,key=lambda a:iso_date(a['data'])) if due else None

def main():
 import os
 from pymongo import MongoClient
 db=MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
 today=datetime.now(ZoneInfo('America/Sao_Paulo')).date();count=0
 for c in db.credenciamentos.find({'deleted_at':None,'controle_documental':{'$exists':True}}):
  control=c['controle_documental'];alert=latest_due(control,today)
  if not alert:continue
  comp=db.companies.find_one({'company_id':c['company_id'],'deleted_at':None})
  if not comp or not comp.get('user_id'):continue
  expiry=iso_date(control['vencimento']);remaining=(expiry-today).days
  key=hashlib.sha256(f"{c['credenciamento_id']}:{expiry}:{alert['antecedencia_dias']}".encode()).hexdigest()[:24]
  notification={'notificacao_id':'notif_cred_'+key,'user_id':comp['user_id'],'tipo':'credenciamento_preventivo','titulo':f"{c['estado_sigla']} — alerta preventivo de credenciamento",'mensagem':f"Vencimento de controle: {expiry.strftime('%d/%m/%Y')}; faltam {remaining} dias. Faixa preventiva interna de {alert['antecedencia_dias']} dias alcançada. Não é prazo formal de protocolo. Confira as ressalvas no controle documental.",'dados':{'company_id':comp['company_id'],'credenciamento_id':c['credenciamento_id'],'natureza':'preventivo_interno','antecedencia_dias':alert['antecedencia_dias'],'vencimento':expiry.isoformat()},'lida':False,'created_at':datetime.now(timezone.utc).isoformat()}
  result=db.notificacoes.update_one({'_id':'cred_alert_'+key},{'$setOnInsert':notification},upsert=True);count+=int(result.upserted_id is not None)
 print(f'Internal notices created: {count}; no external messages sent.')
if __name__=='__main__':main()
