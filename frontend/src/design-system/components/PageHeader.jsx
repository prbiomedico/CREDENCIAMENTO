import React from 'react';
import { cn } from '../../lib/utils';

/** Cabeçalho operacional: contexto textual à esquerda, ações à direita. */
const PageHeader = React.forwardRef(
  ({ title, description, eyebrow, actions, className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn('flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between', className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="font-heading text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
);
PageHeader.displayName = 'PageHeader';

export { PageHeader };
