/**
 * Tutorial videos catalog (spec 2026-10-25 tutoriais-em-video): one entry per menu item, shown only to the
 * roles that can open the screen, and the "Vídeo desta tela" match for the current page.
 */
import { NAV_GROUPS } from '@/lib/navigation/app-nav';
import {
  TUTORIALS,
  essentialTrack,
  nextTutorial,
  tutorialBySlug,
  tutorialForPath,
  tutorialsFor,
  tutorialVideoUrl,
  tutorialPosterUrl,
} from '@/lib/tutorials/catalog';

describe('tutorial videos catalog', () => {
  const published = new Map(TUTORIALS.map((t) => [t.slug, t.published]));
  beforeAll(() => TUTORIALS.forEach((t) => (t.published = true)));
  afterAll(() => TUTORIALS.forEach((t) => (t.published = published.get(t.slug)!)));

  it('has the 46 videos of the spec, unique slugs, each in a menu group', () => {
    expect(TUTORIALS).toHaveLength(46);
    expect(new Set(TUTORIALS.map((t) => t.slug)).size).toBe(TUTORIALS.length);
    for (const t of TUTORIALS) expect(NAV_GROUPS.some((g) => g.id === t.group)).toBe(true);
  });

  it('points every tutorial at a screen of the menu', () => {
    const links = NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href.split('#')[0]));
    for (const t of TUTORIALS) {
      expect(t.routes.length).toBeGreaterThan(0);
      expect(links.some((h) => t.routes[0] === h || t.routes[0].startsWith(h + '/'))).toBe(true);
    }
  });

  it('finds the video of the current screen by the longest route', () => {
    expect(tutorialForPath('/caixa/historico', 'OWNER')?.slug).toBe('caixa');
    expect(tutorialForPath('/admin/tables/qrcodes', 'OWNER')?.slug).toBe('qr-codes-das-mesas');
    expect(tutorialForPath('/admin/tables', 'OWNER')?.slug).toBe('cadastro-de-mesas');
    expect(tutorialForPath('/comanda/abc123', 'CASHIER')?.slug).toBe('mesas-e-balcao');
    expect(tutorialForPath('/dashboard', 'COOK')?.slug).toBe('conhecendo-o-painel');
    expect(tutorialForPath('/dashboard/billing', 'OWNER')?.slug).toBe('minha-assinatura');
    expect(tutorialForPath('/dashboard/xyz', 'OWNER')).toBeNull();
  });

  it('shows each role only the videos of the screens it can open', () => {
    const cook = tutorialsFor('COOK').map((t) => t.slug);
    expect(cook).toContain('cozinha-kds');
    expect(cook).toContain('conhecendo-o-painel');
    expect(cook).not.toContain('financeiro');
    expect(cook).not.toContain('caixa');
    expect(tutorialForPath('/dashboard/financeiro', 'COOK')).toBeNull();
  });

  it('keeps the "Comece por aqui" track in the implantation order', () => {
    expect(essentialTrack('OWNER').map((t) => t.slug)).toEqual([
      'conhecendo-o-painel',
      'insumos',
      'fichas-tecnicas',
      'cardapio-digital',
      'cadastro-de-mesas',
      'caixa',
      'mesas-e-balcao',
      'cozinha-kds',
      'equipe-e-acessos',
    ]);
    expect(nextTutorial('caixa', 'OWNER')?.slug).toBe('mesas-e-balcao');
    expect(nextTutorial('equipe-e-acessos', 'OWNER')?.slug).not.toBe('equipe-e-acessos');
  });

  it('builds the video and poster URLs', () => {
    expect(tutorialVideoUrl('caixa')).toBe('/videos/tutoriais/caixa.mp4');
    expect(tutorialPosterUrl('caixa')).toBe('/videos/tutoriais/caixa.jpg');
  });

  it('hides a video that is not published yet', () => {
    const dre = TUTORIALS.find((t) => t.slug === 'dre')!;
    dre.published = false;
    expect(tutorialBySlug('dre')).toBeNull();
    expect(tutorialsFor('OWNER').map((t) => t.slug)).not.toContain('dre');
    expect(tutorialForPath('/dashboard/financeiro/dre', 'OWNER')?.slug).toBe('financeiro');
    dre.published = true;
    expect(tutorialBySlug('dre')?.title).toBeTruthy();
    expect(tutorialBySlug('nao-existe')).toBeNull();
  });
});

describe('when a video counts as watched', () => {
  it('counts from 90% of the duration, never before the metadata loads', () => {
    const { watchedAt } = require('@/lib/tutorials/catalog');
    expect(watchedAt(89, 100)).toBe(false);
    expect(watchedAt(90, 100)).toBe(true);
    expect(watchedAt(5, NaN)).toBe(false);
    expect(watchedAt(0, 0)).toBe(false);
  });
});

describe('the video of each first step', () => {
  const published = new Map(TUTORIALS.map((t) => [t.slug, t.published]));
  beforeAll(() => TUTORIALS.forEach((t) => (t.published = true)));
  afterAll(() => TUTORIALS.forEach((t) => (t.published = published.get(t.slug)!)));

  it('goes by the step, not by the screen it opens ("Abrir o caixa" opens /vender)', () => {
    const { tutorialForFirstStep } = require('@/lib/tutorials/catalog');
    expect(tutorialForFirstStep('caixa')?.slug).toBe('caixa');
    expect(tutorialForFirstStep('venda')?.slug).toBe('mesas-e-balcao');
    expect(tutorialForFirstStep('cardapio')?.slug).toBe('cardapio-digital');
    expect(tutorialForFirstStep('mesas')?.slug).toBe('cadastro-de-mesas');
    expect(tutorialForFirstStep('equipe')?.slug).toBe('equipe-e-acessos');
    expect(tutorialForFirstStep('endereco')?.slug).toBe('configuracoes-do-restaurante');
    expect(tutorialForFirstStep('nfce')?.slug).toBe('nfce');
    TUTORIALS.find((t) => t.slug === 'nfce')!.published = false;
    expect(tutorialForFirstStep('nfce')).toBeNull();
  });
});

describe('the published videos (lote 1, 2026-10-25)', () => {
  const fs = require('fs');
  const path = require('path');
  const track = [
    'conhecendo-o-painel', 'insumos', 'fichas-tecnicas', 'cardapio-digital', 'cadastro-de-mesas',
    'caixa', 'mesas-e-balcao', 'cozinha-kds', 'equipe-e-acessos',
  ];

  it('publishes the whole "Comece por aqui" track, each with its written steps, length and files', () => {
    for (const slug of track) {
      const t = TUTORIALS.find((x) => x.slug === slug)!;
      expect([slug, t.published]).toEqual([slug, true]);
      expect(t.steps.length).toBeGreaterThan(2);
      expect(t.durationSec).toBeGreaterThan(20);
      for (const ext of ['mp4', 'jpg']) expect([slug, ext, fs.existsSync(path.join(process.cwd(), `public/videos/tutoriais/${slug}.${ext}`))]).toEqual([slug, ext, true]);
    }
  });

  // Lote 2 (2026-10-25): Vender, Caixa e pagamentos, Cardápio e produtos, Estoque e compras
  const lote2 = [
    'pedidos-de-delivery', 'contagem-do-dia', 'pagamentos-online', 'contas-a-pagar', 'adicionais', 'qr-codes-das-mesas',
    'estoque', 'contagem-de-estoque', 'compras', 'desperdicio', 'fornecedores', 'importar-nota-de-compra',
  ];

  it('publishes lote 2 with its steps, length and files', () => {
    for (const slug of lote2) {
      const t = TUTORIALS.find((x) => x.slug === slug)!;
      expect([slug, t.published, t.steps.length > 2, t.durationSec > 15]).toEqual([slug, true, true, true]);
      for (const ext of ['mp4', 'jpg']) expect([slug, ext, fs.existsSync(path.join(process.cwd(), `public/videos/tutoriais/${slug}.${ext}`))]).toEqual([slug, ext, true]);
    }
  });

  // Lote 3 (2026-10-25): Fiscal e Relatórios (dre stays out until it is made)
  const lote3 = ['nfce', 'notas-emitidas', 'cmv', 'consumo-de-insumos', 'vendas', 'lucratividade', 'financeiro', 'relatorio-executivo'];

  it('publishes lote 3 with its steps, length and files', () => {
    for (const slug of lote3) {
      const t = TUTORIALS.find((x) => x.slug === slug)!;
      expect([slug, t.published, t.steps.length > 2, t.durationSec > 15]).toEqual([slug, true, true, true]);
      for (const ext of ['mp4', 'jpg']) expect([slug, ext, fs.existsSync(path.join(process.cwd(), `public/videos/tutoriais/${slug}.${ext}`))]).toEqual([slug, ext, true]);
    }
  });

  // Lote 4 (2026-10-26): Clientes e marketing, Mais recursos (with the DRE) and Configurações
  const lote4 = [
    'clientes-crm', 'cashback', 'campanhas', 'site-de-delivery',
    'planejamento-de-producao', 'escalonar-receita', 'etiquetas-e-validades', 'engenharia-de-cardapio', 'dre', 'turnos', 'comissoes',
    'configuracoes-do-restaurante', 'minha-assinatura', 'whatsapp', 'api-de-pedidos', 'varias-lojas', 'uso-da-ia',
  ];

  it('publishes lote 4 with its steps, length and files', () => {
    for (const slug of lote4) {
      const t = TUTORIALS.find((x) => x.slug === slug)!;
      expect([slug, t.published, t.steps.length > 2, t.durationSec > 15]).toEqual([slug, true, true, true]);
      for (const ext of ['mp4', 'jpg']) expect([slug, ext, fs.existsSync(path.join(process.cwd(), `public/videos/tutoriais/${slug}.${ext}`))]).toEqual([slug, ext, true]);
    }
  });

  it('publishes the whole catalog, every video once', () => {
    const all = [...track, ...lote2, ...lote3, ...lote4];
    expect(new Set(all).size).toBe(all.length);
    expect(TUTORIALS.filter((t) => t.published).map((t) => t.slug).sort()).toEqual(all.sort());
    expect(TUTORIALS.map((t) => t.slug).sort()).toEqual(all.sort());
  });

  it('teaches the AI the name of each published video', () => {
    const { KNOWLEDGE } = require('@/lib/ai/knowledge');
    for (const t of TUTORIALS.filter((x) => x.published)) expect([t.title, KNOWLEDGE.includes(t.title)]).toEqual([t.title, true]);
  });
});
