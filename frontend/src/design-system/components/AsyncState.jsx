import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

function AsyncState({ type = 'loading', title, description, action, className }) {
  const loading = type === 'loading';
  return (
    <div className={cn('flex min-h-40 flex-col items-center justify-center border-y border-border px-6 py-10 text-center', className)} role={loading ? 'status' : 'alert'}>
      {loading ? <Loader2 className="mb-3 h-5 w-5 animate-spin text-accent" /> : <AlertCircle className="mb-3 h-5 w-5 text-destructive" />}
      <p className="text-sm font-semibold text-foreground">{title || (loading ? 'Carregando…' : 'Não foi possível carregar')}</p>
      {description && <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { AsyncState };
