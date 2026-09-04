import React from 'react';
import { cn } from '../../lib/utils';

/** Superfície operacional para tabelas existentes, sem interferir em dados ou ações. */
function DataTableSurface({ children, className, density = 'default', ...props }) {
  return (
    <div
      className={cn('sigcr-table-wrap', density === 'compact' && '[&_tr]:h-9', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { DataTableSurface };
