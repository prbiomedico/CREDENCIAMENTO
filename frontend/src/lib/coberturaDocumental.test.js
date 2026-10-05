import { coberturaDocumental } from './coberturaDocumental';

test('vários documentos da mesma UF não inflam a cobertura', () => {
  expect(coberturaDocumental([{estado_sigla:'SP'}, {estado_sigla:'RN'}], [{estado_sigla:'SP'}, {estado_sigla:'SP'}, {estado_sigla:'RN'}])).toEqual({total:2, comDocumento:2});
});
test('categorias na mesma UF e documentos de outras UFs não alteram a fração', () => {
  expect(coberturaDocumental([{estado_sigla:'SP'}, {estado_sigla:'SP'}], [{estado_sigla:'SP'}, {estado_sigla:'CE'}, {}])).toEqual({total:1, comDocumento:1});
});
test('base vazia não inventa estados cobertos', () => {
  expect(coberturaDocumental([], [{estado_sigla:'SP'}])).toEqual({total:0, comDocumento:0});
});
