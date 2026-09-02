import React from 'react';
import { cn } from '../../lib/utils';

function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex min-h-52 flex-col items-center justify-center border border-dashed border-border px-6 py-10 text-center', className)}>
      {Icon && <Icon className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
