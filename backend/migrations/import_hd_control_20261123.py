"""Scoped, reversible documentary overlay. Does not infer an operational grant."""
import argparse,hashlib,json,os
from pathlib import Path
from datetime import datetime,timezone
from bson import json_util
from pymongo import MongoClient
COMPANY='company_hdregistros'
DATE_FIELDS={'data_ato','assinatura_contratual','publicacao','inicio_contagem','vencimento','limite_protocolo','data_referencia','data','assinatura_ato','data_envio','data_aprovacao'}
def dates(value):
 if isinstance(value,list):return [dates(v)for v in value]
 if isinstance(value,dict):return {k:(datetime.fromisoformat(v).replace(tzinfo=timezone.utc) if k in DATE_FIELDS and v else dates(v)) for k,v in value.items()}
 return value

def main():
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--apply',action='store_true');p.add_argument('--backup-dir');a=p.parse_args()
 db=MongoClient(os.environ['MONGO_URL'],tz_aware=True)[os.environ['DB_NAME']]
 comp=db.companies.find_one({'company_id':COMPANY,'deleted_at':None})
 assert comp and ''.join(c for c in comp['cnpj']if c.isdigit())=='07077276000117'
 owner=db.users.find_one({'user_id':comp['user_id']},{'email':1,'perfil':1});assert owner and owner['email']=='hdregistros@sigcr.com.br' and owner['perfil']=='registradora'
 rows=json.loads(Path(a.source).read_text());assert len(rows)==22 and len({r['uf']for r in rows})==22
 creds=list(db.credenciamentos.find({'company_id':COMPANY,'categoria':'registradora','deleted_at':None}));assert len(creds)==22
 byuf={c['estado_sigla']:c for c in creds};assert set(byuf)=={r['uf']for r in rows}
 docs=[]
 for r in rows:
  if r['uf']=='MA':assert not r['vencimento'] and not r['publicacao'];continue
  doc=db.documentos_gov.find_one({'documento_id':r['documento_id'],'company_id':COMPANY,'deleted_at':None});assert doc,r['uf']
  assert hashlib.sha256(Path(doc['file_path']).read_bytes()).hexdigest()==r['sha256'],r['uf']
  docs.append(doc)
 if not a.apply:print('Preflight OK: owner HD, 22 existing IDs, 21 source hashes, no duplicates.');return
 assert a.backup_dir
 b=Path(a.backup_dir);b.mkdir(mode=0o700,parents=True,exist_ok=False)
 backup=b/'before.bson.json';backup.write_text(json_util.dumps({'company':comp,'credenciamentos':creds,'documentos':docs}));backup.chmod(0o600)
 # A single optimistic update per existing row; keep all other dates, documents and business data.
 for r in rows:
  c=byuf[r['uf']]
  if c.get('controle_documental')==dates(r):continue
  query={'_id':c['_id'],'company_id':COMPANY}
  if 'controle_documental'in c:query['controle_documental']=c['controle_documental']
  else:query['controle_documental']={'$exists':False}
  fields={'controle_documental':dates(r)}
  if not r.get('substituicao_suspensa',r['uf'] in ['SP','PE']):
   fields['validade']=dates(r)['vencimento']
   fields['extrato_contrato']=(r['ato'] or 'Ato não comprovado')+' — '+r['status_documental']+'; '+r['fundamento_calculo']
   fields['status']='ativo' if r['vencimento'] and r['dias_restantes_referencia']>=0 else 'pendente'
  result=db.credenciamentos.update_one(query,{'$set':fields});assert result.matched_count==1,r['uf']
 db.auditoria.insert_one({'auditoria_id':'audit_hd_control_'+datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'),'user_id':'operacao_autorizada_pelo_titular','acao':'atualizar_controle_documental_hd','entidade':'company','entidade_id':COMPANY,'detalhes':{'data_referencia':'2026-11-23','ufs':22,'escopo':'controle_documental e correções verificáveis de validade/extrato/status; demais campos preservados','fontes_conflitantes':['PE'],'sp':'novo PDF conferido; aguarda Termo de Adesão','planilha_atual':'pendente','backup':str(backup)},'created_at':datetime.now(timezone.utc).isoformat()})
 after=list(db.credenciamentos.find({'company_id':COMPANY,'categoria':'registradora','deleted_at':None}));assert len(after)==22
 for c in after:
  prior=byuf[c['estado_sigla']];allowed={'controle_documental','validade','extrato_contrato','status'} if not c['controle_documental'].get('substituicao_suspensa',c['estado_sigla'] in ['SP','PE']) else {'controle_documental'}
  assert {k:v for k,v in c.items()if k not in allowed}=={k:v for k,v in prior.items()if k not in allowed}
 print('Applied: 22 existing records, unrelated fields unchanged, 21 PDFs preserved, backup='+str(backup))
if __name__=='__main__':main()
