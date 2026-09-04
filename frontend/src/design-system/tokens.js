/**
 * SIGCR Design System V2 — contratos semânticos.
 *
 * Estes aliases usam apenas tokens já disponíveis no Tailwind atual. Eles são
 * deliberadamente isolados: nenhuma tela produtiva os consome nesta missão.
 */
export const statusToneClasses = Object.freeze({
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  revoked: 'border-red-200 bg-red-50 text-red-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  analysis: 'border-sky-200 bg-sky-50 text-sky-800',
  diligence: 'border-amber-200 bg-amber-50 text-amber-900',
});
export const layoutTokens = Object.freeze({
  pageMaxWidth: 'max-w-screen-2xl',
  pagePadding: 'px-4 py-6 sm:px-6 lg:px-8',
  sectionGap: 'space-y-5',
});

export const semanticTokens = Object.freeze({
  canvas: 'bg-background text-foreground',
  surface: 'border border-border bg-card text-card-foreground',
  surfaceMuted: 'border border-border bg-muted/45',
  primaryAction: 'bg-primary text-primary-foreground hover:bg-primary/90',
  contextualAccent: 'text-accent',
});
