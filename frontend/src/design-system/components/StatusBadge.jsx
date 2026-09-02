import React from 'react';
import { cn } from '../../lib/utils';
import { statusToneClasses } from '../tokens';

/**
 * Badge semântico desacoplado dos nomes de status do domínio.
 * O caller traduz seu status para um `tone`; valores desconhecidos falham de
 * forma segura para neutral.
 */
function StatusBadge({ tone = 'neutral', className, children, ...props }) {
  const toneClass = statusToneClasses[tone] || statusToneClasses.neutral;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold',
        toneClass,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { StatusBadge };
