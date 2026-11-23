import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Controle from './ControleCredenciamentos';
const rows=require('./controle-hd.fixture.json');
test('documentary view distinguishes pending sources, unknown states and preventive dates',()=>{
 const html=renderToStaticMarkup(<Controle creds={rows.map(r=>({credenciamento_id:r.uf,controle_documental:r}))} docs={[]} companyId="fixture" onDownload={()=>{}} />);
 expect(html).toContain('22 UFs acompanhadas');expect(html).toContain('10/02/2027');expect(html).toContain('79 dias na referência');
 expect(html).toContain('14/02/2027');expect(html).toContain('Sem informação neste levantamento');expect(html).toContain('prazos formais aparecem em campo próprio');
 expect(html).toContain('Conflito de fonte');expect(html).toContain('Em processo de credenciamento');
});
test('no documentary view is invented for another company without control',()=>{
 expect(renderToStaticMarkup(<Controle creds={[]} docs={[]} companyId="other" />)).toBe('');
});
