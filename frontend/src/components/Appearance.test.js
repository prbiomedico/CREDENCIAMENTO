import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import ThemeToggle from './ThemeToggle';
import Ruixen from './ui/ruixen-featured-image-section';
import Controle from './ControleCredenciamentos';
const rows=require('./controle-hd.fixture.json');
const Icon=()=>null;
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;window.matchMedia=jest.fn(()=>({matches:false,addListener:jest.fn(),removeListener:jest.fn(),addEventListener:jest.fn(),removeEventListener:jest.fn()}));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();document.documentElement.classList.remove('dark','light');});
test('theme selection changes appearance and persists without changing account context',()=>{
 act(()=>root.render(<ThemeProvider attribute="class" storageKey="sigcr-theme" defaultTheme="light"><ThemeToggle /></ThemeProvider>));
 act(()=>host.querySelector('[aria-label="Tema escuro"]').click());
 expect(document.documentElement.classList.contains('dark')).toBe(true);expect(localStorage.getItem('sigcr-theme')).toBe('dark');
 act(()=>host.querySelector('[aria-label="Tema claro"]').click());expect(document.documentElement.classList.contains('dark')).toBe(false);expect(localStorage.getItem('sigcr-theme')).toBe('light');
});
test('tabs support arrow keys and show one operational panel at a time',()=>{
 function Wrapper(){const [i,set]=React.useState(0);return <Ruixen tabs={['A','B','C'].map(id=>({id,title:id,description:id,icon:Icon}))} selectedTab={i} onSelect={set}><p>{`Content ${i}`}</p></Ruixen>;}
 act(()=>root.render(<Wrapper/>));
 const tabs=host.querySelectorAll('[role="tab"]');act(()=>tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(host.querySelector('[role="tabpanel"]').textContent).toBe('Content 1');expect(tabs[1].getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(tabs[1]);
});
test('HD separates granted situation, historical expiry and missing documents',()=>{
 act(()=>root.render(<Controle creds={rows.map(r=>({credenciamento_id:r.uf,controle_documental:r}))} docs={[]} companyId="hd-fixture" onDownload={()=>{}}/>));
 const pe=host.querySelector('[data-testid="controle-row-PE"]');expect(pe.textContent).toContain('23/08/2023');expect(pe.textContent).toContain('Prazo documentado encerrado');expect(pe.innerHTML).not.toContain('emerald');
 const rn=host.querySelector('[data-testid="controle-row-RN"]');expect(rn.textContent).toContain('03/08/2024');expect(rn.innerHTML).not.toContain('emerald');
 const ma=host.querySelector('[data-testid="controle-row-MA"]');expect(ma.textContent).toContain('Ainda não aplicável');
 const ba=host.querySelector('[data-testid="controle-row-BA"]');expect(ba.textContent).toContain('Renovação concedida');expect(ba.textContent).not.toContain('não confirmado');
 act(()=>ma.querySelector('button').click());expect(host.textContent).toContain('2026.19201.44273');expect(host.textContent).toContain('04/11/2026');
 act(()=>host.querySelectorAll('[role="tab"]')[1].click());expect(host.querySelector('[role="tabpanel"]').textContent).toContain('Acervo da empresa');expect(host.querySelector('[data-testid="controle-row-PE"]')).toBeNull();
});
