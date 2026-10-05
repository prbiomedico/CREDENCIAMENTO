import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import MinhasSubmissoes from './MinhasSubmissoes';
jest.mock('axios');
jest.mock('../contexts/AuthContext', () => { const user = {perfil:'registradora'}; return {useAuth: () => ({user, initialized:true, isAdmin:false})}; });
jest.mock('react-router-dom', () => ({useSearchParams: () => [new URLSearchParams()]}));
jest.mock('../components/DashboardLayout', () => ({__esModule:true,default:({children}) => <main>{children}</main>}));
jest.mock('../components/FluxoCredenciamento', () => ({__esModule:true,default:() => null}));
jest.mock('@/components/ui/dialog', () => ({Dialog:({open,children}) => open ? <div>{children}</div> : null,DialogContent:({children}) => <div>{children}</div>,DialogHeader:({children}) => <div>{children}</div>,DialogTitle:({children}) => <h2>{children}</h2>}));
jest.mock('sonner', () => ({toast:{success:jest.fn(),error:jest.fn()}}));
const sub = {submissao_id:'sub-1',portaria_id:'p-1',perfil_empresa:'registradora',estado_sigla:'MT',status:'rascunho',itens:[{item_id:'i-1',nome:'Certidão federal',status:'enviado',document_id:'doc-1'}]};
let host,root;
beforeEach(() => {
 global.IS_REACT_ACT_ENVIRONMENT=true;
 axios.get.mockImplementation(url => Promise.resolve({data:url.endsWith('/companies') ? [{company_id:'c-1',name:'Empresa teste',cnpj:'teste',tipo_empresa:'registradora',detrans_atuacao:['MT']}] : url.endsWith('/portarias') ? [{portaria_id:'p-1',estado_sigla:'MT',title:'Norma teste',checklist_itens:[{perfil_alvo:'registradora'}]}] : url.endsWith('/submissoes') ? [sub] : []}));
 axios.post.mockReset();axios.post.mockResolvedValue({data:{...sub,status:'submetido'}});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click = async text => {const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
test('enviar rascunho exige abrir revisão e confirmar; abrir revisão não envia', async()=>{
 await act(async()=>root.render(<MinhasSubmissoes submissaoId="sub-1" />));
 await click('Revisar antes de enviar');
 expect(host.textContent).toContain('Empresa teste');expect(host.textContent).toContain('1 de 1 exigências com anexo');expect(axios.post).not.toHaveBeenCalled();
 await click('Enviar para análise');
 expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/submissoes/sub-1/submeter'),null,{withCredentials:true});
});
test('consulta mantém progresso e anexo mas não oferece envio', async()=>{
 await act(async()=>root.render(<MinhasSubmissoes submissaoId="sub-1" somenteLeitura />));
 expect(host.textContent).toContain('Preparação documental');expect(host.textContent).toContain('Anexo');expect(host.textContent).not.toContain('Revisar antes de enviar');expect(axios.post).not.toHaveBeenCalled();
});
