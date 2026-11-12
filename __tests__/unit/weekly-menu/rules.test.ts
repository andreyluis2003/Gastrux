import {
  todayIn,
  openMenuOf,
  isDue,
  isReleaseStuck,
  remainingPortions,
  portionsLeftText,
  productionSummary,
  bannerText,
  closedText,
  dayLabel,
} from '@/lib/weekly-menu/rules'

describe('weekly-menu rules', () => {
  it('todayIn uses the restaurant timezone', () => {
    expect(todayIn('America/Sao_Paulo', new Date('2026-11-15T02:30:00Z'))).toBe('2026-11-14')
    expect(todayIn('Not/AZone', new Date('2026-11-15T02:30:00Z'))).toBe('2026-11-14')
  })

  describe('openMenuOf', () => {
    const menus = [
      { serviceDate: '2026-11-22', orderDeadline: null },
      { serviceDate: '2026-11-15', orderDeadline: new Date('2026-11-13T23:00:00Z') },
    ]
    it('picks the earliest date before its deadline', () => {
      expect(openMenuOf(menus, '2026-11-13', new Date('2026-11-13T22:59:00Z'))?.serviceDate).toBe('2026-11-15')
    })
    it('skips menus past their deadline', () => {
      expect(openMenuOf(menus, '2026-11-13', new Date('2026-11-13T23:00:01Z'))?.serviceDate).toBe('2026-11-22')
    })
    it('returns null when nothing is left', () => {
      expect(openMenuOf(menus, '2026-11-23', new Date('2026-11-23T12:00:00Z'))).toBeNull()
      expect(openMenuOf([], '2026-11-13', new Date())).toBeNull()
    })
  })

  it('isDue', () => {
    expect(isDue('2026-11-15', '2026-11-14')).toBe(false)
    expect(isDue('2026-11-15', '2026-11-15')).toBe(true)
  })

  it('remainingPortions', () => {
    expect(remainingPortions(20, 18)).toBe(2)
    expect(remainingPortions(20, 25)).toBe(0)
    expect(remainingPortions(null, 5)).toBeNull()
  })

  it('productionSummary sums by product and groups equal notes', () => {
    const out = productionSummary([
      { menuItemId: 'b', name: 'Feijoada', quantity: 2, specialInstructions: 'sem couve' },
      { menuItemId: 'a', name: 'Lasanha', quantity: 1 },
      { menuItemId: 'b', name: 'Feijoada', quantity: 3, specialInstructions: 'sem couve' },
      { menuItemId: 'b', name: 'Feijoada', quantity: 1, specialInstructions: '  ' },
      { menuItemId: 'b', name: 'Feijoada', quantity: 1, specialInstructions: 'bem quente' },
    ])
    expect(out).toEqual([
      { menuItemId: 'b', name: 'Feijoada', quantity: 7, notes: [
        { text: 'sem couve', quantity: 5 },
        { text: 'bem quente', quantity: 1 },
      ] },
      { menuItemId: 'a', name: 'Lasanha', quantity: 1, notes: [] },
    ].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')))
  })

  it('dayLabel', () => {
    expect(dayLabel('2026-11-15')).toBe('domingo, 15/11')
    expect(dayLabel('2026-11-14')).toBe('sábado, 14/11')
  })

  it('bannerText and closedText', () => {
    expect(bannerText('2026-11-14', new Date('2026-11-12T23:00:00Z'), 'America/Sao_Paulo')).toBe(
      'Pedidos para sábado, 14/11 · encomende até quinta às 20h',
    )
    expect(bannerText('2026-11-14', new Date('2026-11-12T23:30:00Z'), 'America/Sao_Paulo')).toBe(
      'Pedidos para sábado, 14/11 · encomende até quinta às 20h30',
    )
    expect(bannerText('2026-11-14', null, 'America/Sao_Paulo')).toBe('Pedidos para sábado, 14/11')
    expect(closedText('2026-11-14')).toBe('Pedidos encerrados para sábado, 14/11')
  })
})

describe('isReleaseStuck (final review 2026-11-10)', () => {
  it('flags a PLACED pre-order with 3+ failed attempts on or after its day', () => {
    expect(isReleaseStuck('PLACED', 3, '2026-11-14', '2026-11-14')).toBe(true);
    expect(isReleaseStuck('PLACED', 5, '2026-11-14', '2026-11-15')).toBe(true);
    expect(isReleaseStuck('PLACED', 2, '2026-11-14', '2026-11-14')).toBe(false);
    expect(isReleaseStuck('PLACED', 3, '2026-11-14', '2026-11-13')).toBe(false);
    expect(isReleaseStuck('RELEASED', 3, '2026-11-14', '2026-11-14')).toBe(false);
  });
});

describe('portionsLeftText', () => {
  it('singular, plural and sold out (homolog 2026-11-11: "só restam 1 porções")', () => {
    expect(portionsLeftText('Suco', 1)).toBe('Suco: só resta 1 porção');
    expect(portionsLeftText('Feijoada', 2)).toBe('Feijoada: só restam 2 porções');
    expect(portionsLeftText('Feijoada', 0)).toBe('Feijoada esgotou');
  });
});
