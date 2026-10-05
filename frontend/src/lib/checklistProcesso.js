// Organização de navegação: não adiciona nem remove exigências da portaria.
export const normalizarBusca = (texto = '') => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const grupoDocumento = (item) => {
  const nome = normalizarBusca(item.nome);
  if (/socio|representante legal|documento pessoal|identidade|rg e cpf/.test(nome)) return 'Sócios e representantes';
  if (/operador|funcionario|colaborador/.test(nome)) return 'Equipe e operadores';
  if (/balanco|patrimonio|economico|financeira/.test(nome)) return 'Qualificação econômico-financeira';
  if (/certidao|fgts|tribut|fiscal|trabalh|cnpj|alvara|licenca/.test(nome)) return 'Regularidade fiscal e trabalhista';
  if (/contrato social|constitutivo|estatuto|junta comercial/.test(nome)) return 'Habilitação jurídica';
  if (/tecnic|sistema|seguranca|lgpd|integridade|contingencia|datacenter|iso|suporte/.test(nome)) return 'Qualificação técnica';
  return 'Requerimentos e demais documentos';
};
export const resumoChecklist = (itens = []) => ({
  total: itens.length,
  anexados: itens.filter(i => Boolean(i.document_id)).length,
  conformes: itens.filter(i => i.status === 'conforme').length,
  pendentes: itens.filter(i => i.status === 'pendente').length,
  diligencias: itens.filter(i => i.status === 'inconforme').length,
  prontoParaEnvio: itens.length > 0 && itens.every(i => i.status === 'enviado' && Boolean(i.document_id)),
});
export const agruparChecklist = (itens = [], busca = '', filtro = 'todos') => {
  const grupos = new Map();
  for (const item of itens) {
    if (filtro !== 'todos' && item.status !== filtro) continue;
    if (!normalizarBusca(`${item.nome} ${item.descricao || ''}`).includes(normalizarBusca(busca.trim()))) continue;
    const grupo = grupoDocumento(item);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(item);
  }
  return [...grupos].map(([nome, itensGrupo]) => ({ nome, itens: itensGrupo }));
};
