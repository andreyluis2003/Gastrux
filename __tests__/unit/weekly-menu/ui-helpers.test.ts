import { buildItems, confirmationText, deadlineToIso, isoToLocalInput, summaryLine } from '@/lib/weekly-menu/ui-helpers'

describe('weekly menu ui helpers', () => {
  it('deadline: empty is null, local value round-trips', () => {
    expect(deadlineToIso('')).toBeNull()
    expect(deadlineToIso('xx')).toBeNull()
    const iso = deadlineToIso('2026-11-12T20:00')!
    expect(new Date(iso).getHours()).toBe(20)
    expect(isoToLocalInput(iso)).toBe('2026-11-12T20:00')
    expect(isoToLocalInput(null)).toBe('')
  })
  it('buildItems: blank or invalid portions mean no limit', () => {
    expect(buildItems({ a: '20', b: '', c: '0', d: 'x', e: '3' })).toEqual([
      { menuItemId: 'a', portionLimit: 20 },
      { menuItemId: 'b', portionLimit: null },
      { menuItemId: 'c', portionLimit: null },
      { menuItemId: 'd', portionLimit: null },
      { menuItemId: 'e', portionLimit: 3 },
    ])
  })
  it('summaryLine', () => {
    expect(summaryLine('Feijoada', 18, 20)).toBe('Feijoada: 18 de 20')
    expect(summaryLine('Feijoada', 18, null)).toBe('Feijoada: 18')
  })
  it('confirmationText', () => {
    expect(confirmationText('sábado, 15/11')).toBe('Encomenda para sábado, 15/11')
  })
})
