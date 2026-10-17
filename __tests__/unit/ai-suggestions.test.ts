/** Chat suggestions by screen and role: a cook or cashier is never offered a question the AI will refuse (prod check 2026-10-17) */
import { suggestionsFor } from '../../lib/ai/suggestions';

describe('chat suggestions', () => {
  it('managers get the suggestions of the screen, or the default ones', () => {
    expect(suggestionsFor('/caixa', 'OWNER')).toContain('Como faço uma sangria?');
    expect(suggestionsFor('/dashboard', 'MANAGER')).toContain('Quanto vendi ontem?');
  });

  it('a cook gets kitchen questions, never sales or money, on any screen', () => {
    for (const path of ['/dashboard', '/caixa', '/dashboard/financeiro', '/cozinha']) {
      const s = suggestionsFor(path, 'COOK');
      expect(s.length).toBeGreaterThan(0);
      expect(s.join(' ')).not.toMatch(/vend|lucro|CMV|resultado|margem|gastei|caixa/i);
    }
    expect(suggestionsFor('/dashboard', 'COOK')).toContain('Como marco um pedido como pronto na cozinha?');
  });

  it('a cashier gets selling questions, never results or costs', () => {
    const s = suggestionsFor('/dashboard/financeiro', 'CASHIER');
    expect(s.join(' ')).not.toMatch(/lucro|CMV|resultado|margem|gastei|energia/i);
    expect(s).toContain('Como faço uma sangria?');
  });
});
