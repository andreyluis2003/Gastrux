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
