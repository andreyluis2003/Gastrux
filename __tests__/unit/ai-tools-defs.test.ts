// @ts-nocheck
import { toolsFor, TOOL_ROLES } from '../../lib/ai/tools/defs';
import { parsePeriod, AiToolError } from '../../lib/ai/tools/period';

const names = (role) => toolsFor(role).map((t) => t.name);

describe('AI tools (lib/ai/tools)', () => {
  it('managers get every tool; cashier and cook only theirs (spec §4.3)', () => {
    expect(names('OWNER')).toEqual(Object.keys(TOOL_ROLES));
    expect(names('MANAGER')).toEqual(names('OWNER'));
    expect(names('CASHIER')).toEqual(['itens_vendidos', 'caixa_turno', 'mesas_agora', 'contagem_dia', 'plano']);
    expect(names('COOK')).toEqual(['itens_vendidos', 'mesas_agora', 'contagem_dia', 'validades', 'estoque_baixo', 'ficha_tecnica', 'plano']);
  });

  it('every tool is strict, closed and requires all its properties', () => {
    for (const t of toolsFor('OWNER')) {
      expect([t.name, t.strict, t.input_schema.additionalProperties]).toEqual([t.name, true, false]);
      expect([t.name, [...(t.input_schema.required as string[])].sort()]).toEqual([t.name, Object.keys(t.input_schema.properties ?? {}).sort()]);
      expect(t.description.length).toBeGreaterThan(30);
    }
  });

  it('no tool asks for restaurant, user or role', () => {
    for (const t of toolsFor('OWNER')) {
      for (const key of Object.keys(t.input_schema.properties ?? {})) expect(/restaur|user|usuario|perfil|role/i.test(key)).toBe(false);
    }
  });

  it('periods: Brasília days, end inclusive, at most 366 days, refused politely', () => {
    const p = parsePeriod({ inicio: '2026-09-01', fim: '2026-09-30' });
    expect(p.from.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(() => parsePeriod({ inicio: '2026-09-30', fim: '2026-09-01' })).toThrow('antes');
    expect(() => parsePeriod({ inicio: '2025-01-01', fim: '2026-09-30' })).toThrow('366');
    for (const bad of [{ inicio: '01/09/2026', fim: '2026-09-30' }, {}, null, { inicio: '2026-02-30', fim: '2026-03-01' }, { inicio: '2026-13-01', fim: '2026-13-02' }]) {
      expect(() => parsePeriod(bad)).toThrow(AiToolError);
    }
  });
});
