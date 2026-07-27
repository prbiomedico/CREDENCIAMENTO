// Utilitario cn para combinar classNames (alternativa ao clsx sem dependencia extra)
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
