import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Controle,{vencimentoExibido} from './ControleCredenciamentos';
const rows=require('./controle-hd.fixture.json');
test('main view has independent status, expiry, pending-document and detail-button columns',()=>{
 const html=renderToStaticMarkup(<Controle creds={rows.map(r=>({credenciamento_id:r.uf,controle_documental:r}))} docs={[]} companyId="fixture" onDownload={()=>{}}/>);
 expect(html).toContain('Situação do credenciamento');expect(html).toContain('Pendência documental');expect(html).toContain('23/08/2023');expect(html).toContain('03/08/2024');expect(html).toContain('Ainda não aplicável');expect(html).toContain('Sem informação neste levantamento');
});
test('expiry missing from a document is distinct from conditional no-fixed-date term',()=>{
 const by=Object.fromEntries(rows.map(r=>[r.uf,r]));expect(vencimentoExibido(by.PR)).toContain('Sem data fixa');expect(vencimentoExibido(by.BA)).toContain('A calcular');expect(vencimentoExibido(by.MA)).toBe('Ainda não aplicável');expect(vencimentoExibido(by.SP)).toBe('Em conciliação entre os atos');
});
