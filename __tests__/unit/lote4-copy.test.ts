/**
 * Copy found while recording the tutorial videos of lote 4 (2026-10-25): the menu engineering wrote "Boa margem (65.0%)"
 * and "promoção cruzada com STARs", "1 item ... porque não têm custo"; Minha assinatura said "Upgrade ... features";
 * the time zone list showed "Sao_Paulo", "Belem"; Várias lojas said "1 unidade(s)".
 */
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
import { buildRecommendation } from '@/lib/menu-engineering/analyze';
import { timezoneLabel } from '@/lib/settings/timezone-label';
import { translations } from '@/lib/i18n/translations';

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

describe('lote 4 copy', () => {
  it('writes the menu engineering percentages with a comma and in Portuguese', () => {
    expect(buildRecommendation('PUZZLE', 35, 65)).toContain('Boa margem (65,0%)');
    expect(buildRecommendation('PUZZLE', 35, 65)).not.toContain('STARs');
    expect(buildRecommendation('HORSE', 42.35, 20)).toContain('(42,4%)');
  });

  it('agrees the verb with one item without ficha', () => {
    expect(read('app/engenharia-cardapio/page.tsx')).toMatch(/1 item sem ficha técnica fica fora desta análise, porque não tem custo/);
  });

  it('says the billing upgrade in Portuguese', () => {
    expect((translations as any)['pt-BR']['billing.upgradeDesc']).toBe('Mude para um plano maior para liberar mais recursos.');
  });

  it('names the time zones like people say them', () => {
    expect(timezoneLabel('America/Sao_Paulo')).toBe('Brasília (São Paulo)');
    expect(timezoneLabel('America/Belem')).toBe('Belém');
    expect(timezoneLabel('America/Cuiaba')).toBe('Cuiabá');
    expect(timezoneLabel('America/Noronha')).toBe('Fernando de Noronha');
    expect(read('app/admin/settings/page.tsx')).toContain('timezoneLabel(tz)');
  });

  it('counts the stores in Várias lojas without "(s)"', () => {
    expect(read('app/admin/multi-location/page.tsx')).not.toContain('unidade(s)');
  });
});
