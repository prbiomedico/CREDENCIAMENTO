import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Mantém a última intenção visual quando um componente-base e a tela definem
// a mesma propriedade (ex.: Badge default grafite + status pendente claro).
// Sem o merge, a ordem gerada pelo Tailwind podia produzir fundo escuro com
// texto escuro, mesmo com classes aparentemente corretas no JSX.
export function cn(...classes) {
  return twMerge(clsx(classes));
}
