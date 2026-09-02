/**
 * SIGCR Design System V2 — contratos semânticos.
 *
 * Estes aliases usam apenas tokens já disponíveis no Tailwind atual. Eles são
 * deliberadamente isolados: nenhuma tela produtiva os consome nesta missão.
 */
export const statusToneClasses = Object.freeze({
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  info: 'border-primary-500/30 bg-primary-500/10 text-primary-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  neutral: 'border-zinc-600 bg-zinc-800 text-zinc-300',
  revoked: 'border-red-500/30 bg-red-500/10 text-red-300',
  approved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  analysis: 'border-primary-500/30 bg-primary-500/10 text-primary-300',
  diligence: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
});
export const layoutTokens = Object.freeze({
  pageMaxWidth: 'max-w-screen-2xl',
  pagePadding: 'px-4 py-6 sm:px-6 lg:px-8',
  sectionGap: 'space-y-6',
});
