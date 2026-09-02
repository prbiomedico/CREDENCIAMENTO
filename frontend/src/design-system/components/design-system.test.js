import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageContainer } from './PageContainer';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

describe('SIGCR Design System V2 foundation', () => {
  test('PageContainer renders the standard content boundary', () => {
    const html = renderToStaticMarkup(<PageContainer data-testid="page">Conteúdo</PageContainer>);
    expect(html).toContain('<main');
    expect(html).toContain('max-w-screen-2xl');
    expect(html).toContain('Conteúdo');
  });

  test('PageHeader exposes title, description and actions', () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Portarias" description="Gestão operacional" actions={<button>Novo</button>} />
    );
    expect(html).toContain('<h1');
    expect(html).toContain('Portarias');
    expect(html).toContain('Gestão operacional');
    expect(html).toContain('Novo');
  });

  test('StatusBadge uses semantic tone and neutral fallback', () => {
    expect(renderToStaticMarkup(<StatusBadge tone="approved">Aprovado</StatusBadge>)).toContain('bg-emerald-500/10');
    expect(renderToStaticMarkup(<StatusBadge tone="unknown">Outro</StatusBadge>)).toContain('bg-zinc-800');
  });
});
