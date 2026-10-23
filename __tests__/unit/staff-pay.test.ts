import { parseStaffPay } from '@/lib/staff/pay';

describe('parseStaffPay (Equipe e acessos, 2026-10-23)', () => {
  it('takes the commission rule with comma or dot decimals', () => {
    expect(parseStaffPay({ commissionType: 'PERCENTAGE', commissionValue: '5' })).toEqual({ ok: true, data: { commissionType: 'PERCENTAGE', commissionValue: 5 } });
    expect(parseStaffPay({ commissionType: 'FIXED', commissionValue: '2,50' })).toEqual({ ok: true, data: { commissionType: 'FIXED', commissionValue: 2.5 } });
    expect(parseStaffPay({ commissionType: 'FIXED', commissionValue: 150 })).toMatchObject({ ok: true });
  });

  it('an empty value means no commission', () => {
    expect(parseStaffPay({ commissionType: 'PERCENTAGE', commissionValue: '' })).toEqual({ ok: true, data: { commissionType: 'PERCENTAGE', commissionValue: null } });
  });

  it('refuses a percentage over 100, negatives, unknown types and a value without its type', () => {
    expect(parseStaffPay({ commissionType: 'PERCENTAGE', commissionValue: 120 })).toMatchObject({ ok: false });
    expect(parseStaffPay({ commissionType: 'FIXED', commissionValue: -1 })).toMatchObject({ ok: false });
    expect(parseStaffPay({ commissionType: 'FIXED', commissionValue: '2.5.1' })).toMatchObject({ ok: false });
    expect(parseStaffPay({ commissionType: 'HYBRID', commissionValue: 1 })).toMatchObject({ ok: false });
    expect(parseStaffPay({ commissionValue: 5 })).toMatchObject({ ok: false });
  });

  it('salary and hours; other fields (role, status) are ignored', () => {
    expect(parseStaffPay({ baseSalary: '1800,00', defaultStartTime: '17:00', defaultEndTime: '23:30', role: 'MANAGER', status: 'INACTIVE' } as any))
      .toEqual({ ok: true, data: { basesalary: 1800, defaultStartTime: '17:00', defaultEndTime: '23:30' } });
    expect(parseStaffPay({ defaultStartTime: '25:00' })).toMatchObject({ ok: false });
    expect(parseStaffPay({ role: 'MANAGER' } as any)).toEqual({ ok: false, error: 'Nada para mudar' });
  });
});
