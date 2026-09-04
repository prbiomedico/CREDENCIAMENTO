import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageContainer } from './PageContainer';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';
import { TableToolbar } from './TableToolbar';
import { EmptyState } from './EmptyState';

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
    expect(renderToStaticMarkup(<StatusBadge tone="approved">Aprovado</StatusBadge>)).toContain('bg-emerald-50');
    expect(renderToStaticMarkup(<StatusBadge tone="unknown">Outro</StatusBadge>)).toContain('bg-slate-50');
  });

  test('TableToolbar keeps search, filters and actions in predictable regions', () => {
    const html = renderToStaticMarkup(<TableToolbar primary={<input aria-label="Busca" />} filters={<span>UF</span>} actions={<button>Novo</button>} />);
    expect(html).toContain('aria-label="Busca"');
    expect(html).toContain('UF');
    expect(html).toContain('Novo');
  });

  test('EmptyState exposes title, guidance and action', () => {
    const html = renderToStaticMarkup(<EmptyState title="Sem registros" description="Revise os filtros" action={<button>Limpar</button>} />);
    expect(html).toContain('Sem registros');
    expect(html).toContain('Revise os filtros');
    expect(html).toContain('Limpar');
  });
});
