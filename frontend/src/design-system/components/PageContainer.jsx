import React from 'react';
import { cn } from '../../lib/utils';
import { layoutTokens } from '../tokens';

/** Limite e respiro padrão para conteúdo de uma rota autenticada. */
const PageContainer = React.forwardRef(({ className, children, ...props }, ref) => (
  <main
    ref={ref}
    className={cn('mx-auto w-full', layoutTokens.pageMaxWidth, layoutTokens.pagePadding, className)}
    {...props}
  >
    {children}
  </main>
));
PageContainer.displayName = 'PageContainer';

export { PageContainer };
