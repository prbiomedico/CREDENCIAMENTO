export function coberturaDocumental(credenciamentos, documentos) {
  const ufs = new Set(credenciamentos.map((c) => c.estado_sigla).filter(Boolean));
  const ufsComDocumento = new Set(documentos.map((d) => d.estado_sigla).filter((uf) => ufs.has(uf)));
  return {total: ufs.size, comDocumento: ufsComDocumento.size};
}
