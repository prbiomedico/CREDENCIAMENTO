import React from 'react';
import { cn } from '../../lib/utils';

function TableToolbar({ primary, filters, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 border-y border-border bg-card/40 p-3 lg:flex-row lg:items-center', className)}>
      <div className="min-w-0 flex-1">{primary}</div>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </div>
  );
}

export { TableToolbar };
