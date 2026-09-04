import React from 'react';
import { cn } from '../../lib/utils';

function FormSection({ title, description, children, className }) {
  return (
    <section className={cn('border-b border-border pb-6', className)}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export { FormSection };
