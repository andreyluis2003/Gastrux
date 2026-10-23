import { sendAdminAlert } from '@/lib/admin-alerts';

// Owner, 2026-10-23: the platform alerts go by Resend (Abacus needed NOTIF_ID_* keys production never had)
describe('sendAdminAlert', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

  it('sends through Resend to the admin address, never through Abacus', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.ABACUSAI_API_KEY = 'abacus-key';
    process.env.ADMIN_ALERT_EMAIL = 'dono@gastrux.test';
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'x' }), text: async () => '' } as any);
    const ok = await sendAdminAlert({ notificationId: 'n1', subject: 'Pagamento falhou', htmlBody: '<p>oi</p>', recipientEmail: 'dono@gastrux.test' });
    expect(ok).toBe(true);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(['https://api.resend.com/emails']);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as any).body)).toMatchObject({ to: ['dono@gastrux.test'], subject: 'Pagamento falhou', html: '<p>oi</p>' });
  });

  it('a Resend failure returns false and does not throw', async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as any);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendAdminAlert({ notificationId: 'n1', subject: 'x', htmlBody: 'y' })).toBe(false);
  });
});
