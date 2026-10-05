import { agruparChecklist, resumoChecklist } from './checklistProcesso';
test('organização mantém itens distintos com o mesmo nome e pesquisa sem acentos', () => {
  const itens = [{item_id:'1',nome:'Certidão Federal',status:'enviado'}, {item_id:'2',nome:'Certidão Federal',status:'inconforme'}, {item_id:'3',nome:'Balanço patrimonial',status:'pendente'}];
  expect(agruparChecklist(itens).flatMap(g => g.itens)).toHaveLength(3);
  expect(agruparChecklist(itens,'certidao','inconforme').flatMap(g => g.itens).map(i => i.item_id)).toEqual(['2']);
});
test('arquivo anexado e documento aprovado têm contagens diferentes', () => {
  const r = resumoChecklist([{status:'enviado',document_id:'1'}, {status:'inconforme',document_id:'2'}, {status:'pendente'}, {status:'conforme',document_id:'3'}]);
  expect(r).toEqual({total:4,anexados:3,conformes:1,pendentes:1,diligencias:1,prontoParaEnvio:false});
});
test('revisão não habilita envio vazio nem um item enviado sem vínculo de arquivo', () => {
  expect(resumoChecklist([]).prontoParaEnvio).toBe(false);
  expect(resumoChecklist([{status:'enviado'}]).prontoParaEnvio).toBe(false);
  expect(resumoChecklist([{status:'enviado',document_id:'1'}]).prontoParaEnvio).toBe(true);
});
