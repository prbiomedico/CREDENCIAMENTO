import React from 'react';
import { cn } from '../../lib/utils';

function DescriptionList({ items = [], className, columns = 2 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4 border-y border-border py-4', columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2', className)}>
      {items.map(({ label, value, mono }, index) => (
        <div key={`${label}-${index}`} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className={cn('mt-1 text-sm font-medium text-foreground', mono && 'font-mono tabular-nums')}>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export { DescriptionList };
