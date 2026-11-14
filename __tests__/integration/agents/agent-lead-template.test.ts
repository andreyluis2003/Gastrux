// @ts-nocheck
/**
 * Lead template ("pedido_informacoes") from a closed conversation, and the team e-mail when a new
 * conversation starts on the Gastrux official number.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn() }));
import { getServerSession } from 'next-auth';
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { POST as sendLead } from '../../../app/api/admin/agent-conversations/[phone]/lead-template/route';
import { handleInbound } from '../../../lib/agents/whatsapp/conversation';
import { platformTeam } from '../../../lib/agents/platform-team';
import { LEAD_TEMPLATE } from '../../../lib/agents/whatsapp/templates';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const ADMIN = { user: { id: 'admin-x', email: 'equipe@gastrux.test', role: 'ADMIN' } };
const realFetch = global.fetch;
const HOUR = 3600 * 1000;

let waId: string;
let sent: any[];
let metaFails: string | null;
let adminUser: any;

const lead = () => sendLead(new Request('http://x/x', { method: 'POST' }) as any, { params: { phone: waId } });
const inbound = (text: string) => handleInbound({ id: `wamid.${crypto.randomBytes(5).toString('hex')}`, from: waId, type: 'text', text: { body: text } }, 'Joao');
const seedIn = (ageHours: number) =>
  prisma.agentWhatsAppMessage.create({ data: { phone: waId, waId, direction: 'IN', text: 'Olá', messageType: 'text', waMessageId: `wamid.${crypto.randomBytes(5).toString('hex')}`, createdAt: new Date(Date.now() - ageHours * HOUR) } });

describe('lead template and new-conversation e-mail', () => {
  beforeAll(async () => {
    waId = `1650${crypto.randomInt(1000000, 9999999)}`;
    // Make sure the team is never empty in the test DB
    adminUser = await prisma.user.create({ data: { email: `lead-admin-${crypto.randomBytes(4).toString('hex')}@gastrux.test`, name: 'Equipe', password: 'x', role: 'ADMIN' } });
  });
  afterAll(async () => {
    global.fetch = realFetch;
    delete process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: waId } });
    await prisma.notification.deleteMany({ where: { title: 'WhatsApp de Joao' } });
    await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
  });
  beforeEach(async () => {
    process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = 'pid';
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN);
    (sendTransactionalEmail as jest.Mock).mockReset().mockResolvedValue({ provider: 'resend' });
    sent = [];
    metaFails = null;
    global.fetch = jest.fn(async (_url, init) => {
      if (metaFails) return new Response(JSON.stringify({ error: { message: metaFails } }), { status: 400 });
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${crypto.randomBytes(5).toString('hex')}` }] }), { status: 200 });
    });
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: waId } });
  });

  describe('POST lead-template', () => {
    it('is staff only', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u', email: 'u@x.test', role: 'OWNER' } });
      expect((await lead()).status).toBe(401);
    });

    it('window open: 409 and nothing sent', async () => {
      await seedIn(1);
      const res = await lead();
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('WINDOW_OPEN');
      expect(sent).toHaveLength(0);
    });

    it('window closed: sends the template and records the outbound, then refuses a repeat in 24 h', async () => {
      await seedIn(30);
      const res = await lead();
      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(waId);
      expect(sent[0].template.name).toBe('pedido_informacoes');
      expect(sent[0].template.components.map((c) => c.type)).toEqual(['button']);
      const row = await prisma.agentWhatsAppMessage.findFirst({ where: { phone: waId, direction: 'OUT' } });
      expect(row.messageType).toBe('template');
      expect(row.text).toBe(LEAD_TEMPLATE.text);
      expect(row.sentBy).toBe(ADMIN.user.email);
      expect((await res.json()).message.id).toBe(row.id);

      const again = await lead();
      expect(again.status).toBe(409);
      expect((await again.json()).code).toBe('ALREADY_SENT');
      expect(sent).toHaveLength(1);
    });

    it('Meta refusing the template is a 502 with a clear message and records nothing', async () => {
      await seedIn(30);
      metaFails = 'Template name does not exist';
      const res = await lead();
      expect(res.status).toBe(502);
      expect((await res.json()).error).toContain('A Meta ainda não aprovou o modelo ou recusou o envio: Template name does not exist');
      expect(await prisma.agentWhatsAppMessage.count({ where: { phone: waId, direction: 'OUT' } })).toBe(0);
    });

    it('unknown number is 404', async () => {
      expect((await lead()).status).toBe(404);
    });
  });

  describe('new conversation e-mail', () => {
    it('first message e-mails every team member; a second one minutes later sends none', async () => {
      const team = await platformTeam();
      expect(team.length).toBeGreaterThan(0);
      await inbound('Olá! Posso ter mais informações sobre isso?');
      const calls = (sendTransactionalEmail as jest.Mock).mock.calls.map((c) => c[0]);
      expect(calls.map((c) => c.to).sort()).toEqual(team.map((m) => m.email).sort());
      expect(calls[0].subject).toBe('Nova conversa no WhatsApp: Joao');
      expect(calls[0].html).toContain('Posso ter mais informações');
      expect(calls[0].html).toContain('Responda em até 24 horas pelo Gastrux');
      expect(calls[0].html).toContain('/admin/agente');

      (sendTransactionalEmail as jest.Mock).mockClear();
      await inbound('Tem teste grátis?');
      expect(sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it('a message after more than 24 h of silence sends again', async () => {
      await seedIn(30);
      await inbound('Voltei');
      expect((sendTransactionalEmail as jest.Mock).mock.calls.length).toBe((await platformTeam()).length);
    });

    it('an e-mail failure does not break the webhook and the message is still recorded', async () => {
      (sendTransactionalEmail as jest.Mock).mockRejectedValue(new Error('Resend 500'));
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(inbound('Oi')).resolves.toBeUndefined();
      expect(err).toHaveBeenCalledWith(expect.stringContaining('[agent-whatsapp]'), 'Resend 500');
      err.mockRestore();
      expect(await prisma.agentWhatsAppMessage.count({ where: { phone: waId, direction: 'IN' } })).toBe(1);
    });
  });
});
