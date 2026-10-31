// @ts-nocheck
/**
 * The Gastrux official number: an approved draft goes as the Meta template, or as the edited text within
 * 24 hours of the client's message; replies reach the team and never the order bot; SAIR stops the tips.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn() }));
jest.mock('../../../lib/whatsapp/bot', () => ({ handleInboundMessage: jest.fn() }));
import { getServerSession } from 'next-auth';
import { handleInboundMessage } from '../../../lib/whatsapp/bot';
import { POST as webhook } from '../../../app/api/whatsapp/webhook/route';
import { GET as queue } from '../../../app/api/admin/agent-actions/route';
import { PATCH } from '../../../app/api/admin/agent-actions/[id]/route';
import { GET as listAll } from '../../../app/api/admin/agent-conversations/route';
import { GET as openOne, POST as answer } from '../../../app/api/admin/agent-conversations/[phone]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const ADMIN = { user: { id: 'admin-x', email: 'equipe@gastrux.test', role: 'ADMIN' } };
const SECRET = 'test-secret';
const PHONE_ID = 'platform-phone-id';
const realFetch = global.fetch;

let a: any;
let sent: any[];
let metaFails: string | null;

function hook(value: any) {
  const raw = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_ID }, ...value } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
  return webhook(new Request('http://x/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: raw }) as any);
}
const inbound = (body: string, from = a.waId, id = `wamid.${crypto.randomBytes(5).toString('hex')}`) =>
  hook({ contacts: [{ wa_id: from, profile: { name: 'Maria' } }], messages: [{ id, from, type: 'text', text: { body } }] });
const approve = (id: string, text?: string) =>
  PATCH(new Request(`http://x/x/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', text }) }) as any, { params: { id } });
const say = (phone: string, text: string) =>
  answer(new Request('http://x/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }) as any, { params: { phone } });

const draft = (trigger: string) => prisma.agentAction.create({
  data: { restaurantId: a.restaurant.id, userId: a.owner.id, trigger, channel: 'WHATSAPP', status: 'DRAFT', text: 'Oi, Maria!\n\nhttps://gastrux.com/caixa\n\nEquipe Gastrux' },
});

describe('official WhatsApp number', () => {
  beforeAll(async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const n = String(crypto.randomInt(90000000, 99999999));
    const owner = await prisma.user.create({ data: { email: `wa-${tag}@gastrux.test`, name: 'Maria Silva', role: 'OWNER', whatsapp: `55669${n}`, whatsappMarketingConsentAt: new Date() } });
    const restaurant = await prisma.restaurant.create({ data: { name: `Pizzaria ${tag}`, ownerId: owner.id, status: 'TRIAL' } });
    // Meta reports this mobile without the ninth digit
    a = { owner, restaurant, waId: `5566${n}`, key: `5566${n}` };
    process.env.WHATSAPP_APP_SECRET = SECRET;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    delete process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: a.key } });
    await prisma.restaurant.delete({ where: { id: a.restaurant.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: a.owner.id } }).catch(() => {});
  });

  beforeEach(async () => {
    process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = PHONE_ID;
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN);
    (handleInboundMessage as jest.Mock).mockReset();
    sent = [];
    metaFails = null;
    global.fetch = jest.fn(async (_url, init) => {
      if (metaFails) return new Response(JSON.stringify({ error: { message: metaFails } }), { status: 400 });
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${crypto.randomBytes(5).toString('hex')}` }] }), { status: 200 });
    });
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: a.key } });
    await prisma.agentAction.deleteMany({ where: { restaurantId: a.restaurant.id } });
    await prisma.user.update({ where: { id: a.owner.id }, data: { onboardingEmailsOptOut: false, whatsappMarketingConsentAt: new Date() } });
  });

  it('outside the 24 hours an approved draft goes as the template, with the button path, ignoring edits', async () => {
    const d = await draft('sem_caixa');
    const res = await approve(d.id, 'Texto editado');
    expect(res.status).toBe(200);
    expect((await res.json()).official).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(a.owner.whatsapp);
    expect(sent[0].template.name).toBe('sem_caixa');
    expect(sent[0].template.components[1].parameters[0].text).toBe('caixa');
    const row = await prisma.agentAction.findUnique({ where: { id: d.id } });
    expect(row.status).toBe('SENT');
    expect(row.text).toContain('já está pronto');
    expect(await prisma.agentWhatsAppMessage.count({ where: { agentActionId: d.id, direction: 'OUT', messageType: 'template' } })).toBe(1);
  });

  it('a template without the opt-in is refused and nothing goes out; a client who wrote still gets free text', async () => {
    await prisma.user.update({ where: { id: a.owner.id }, data: { whatsappMarketingConsentAt: null } });
    const d = await draft('sem_caixa');
    expect((await approve(d.id)).status).toBe(409);
    expect(sent).toHaveLength(0);
    expect((await prisma.agentAction.findUnique({ where: { id: d.id } })).status).toBe('DRAFT');

    await inbound('Oi');
    sent = [];
    expect((await approve(d.id, 'Claro')).status).toBe(200);
    expect(sent[0].type).toBe('text');
  });

  it('within the 24 hours the edited text goes as free text', async () => {
    await inbound('Oi');
    sent = [];
    const d = await draft('sem_caixa');
    expect((await approve(d.id, 'Texto editado')).status).toBe(200);
    expect(sent[0].type).toBe('text');
    expect(sent[0].text.body).toBe('Texto editado');
  });

  it('a refusal from Meta puts the draft back with the reason and records nothing as sent', async () => {
    metaFails = 'Template not approved';
    const d = await draft('sem_caixa');
    const res = await approve(d.id);
    expect(res.status).toBe(424);
    const row = await prisma.agentAction.findUnique({ where: { id: d.id } });
    expect(row.status).toBe('DRAFT');
    expect(row.error).toContain('Template not approved');
    expect(await prisma.agentWhatsAppMessage.count({ where: { agentActionId: d.id } })).toBe(0);
  });

  it('the queue shows the template text, and keeps wa.me where the number is not configured', async () => {
    await draft('sem_caixa');
    let out = await (await queue(new Request('http://x/x?status=DRAFT') as any)).json();
    expect(out.official).toBe(true);
    expect(out.actions.find((x) => x.restaurantId === a.restaurant.id).templateText).toContain('já está pronto');

    delete process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
    out = await (await queue(new Request('http://x/x?status=DRAFT') as any)).json();
    expect(out.official).toBe(false);
    const item = out.actions.find((x) => x.restaurantId === a.restaurant.id);
    expect(item.templateText).toBeNull();
    const res = await (await approve(item.id)).json();
    expect(res.waUrl).toContain('wa.me');
    expect(sent).toHaveLength(0);
  });

  it('a reply reaches the team, finds the owner without the ninth digit, never the order bot, and a repeat counts once', async () => {
    const id = `wamid.same.${crypto.randomBytes(4).toString('hex')}`;
    await inbound('Tenho uma dúvida', a.waId, id);
    await inbound('Tenho uma dúvida', a.waId, id);
    expect(handleInboundMessage).not.toHaveBeenCalled();
    const rows = await prisma.agentWhatsAppMessage.findMany({ where: { phone: a.key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(a.owner.id);
    expect(rows[0].restaurantId).toBe(a.restaurant.id);

    const { conversations } = await (await listAll()).json();
    const c = conversations.find((x) => x.phone === a.key);
    expect(c.name).toBe(a.restaurant.name);
    expect(c.unread).toBe(1);
    expect(c.windowOpen).toBe(true);
  });

  it('a stranger is recorded by number', async () => {
    const n = `1650${crypto.randomInt(1000000, 9999999)}`;
    await inbound('Quanto custa?', n);
    const { conversations } = await (await listAll()).json();
    expect(conversations.find((x) => x.phone === n).name).toBe(`+${n}`);
    await prisma.agentWhatsAppMessage.deleteMany({ where: { phone: n } });
  });

  it('the team answers within 24 hours, opening reads the conversation, and afterwards it is refused', async () => {
    await inbound('Oi');
    const opened = await (await openOne(new Request('http://x/x') as any, { params: { phone: a.key } })).json();
    expect(opened.windowOpen).toBe(true);
    expect((await (await listAll()).json()).conversations.find((x) => x.phone === a.key).unread).toBe(0);

    expect((await say(a.key, 'Claro, posso ajudar')).status).toBe(200);
    expect(sent[0].to).toBe(a.waId);
    expect((await prisma.agentWhatsAppMessage.findFirst({ where: { phone: a.key, direction: 'OUT' } })).sentBy).toBe(ADMIN.user.email);

    await prisma.agentWhatsAppMessage.updateMany({ where: { phone: a.key, direction: 'IN' }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    sent = [];
    const res = await say(a.key, 'Oi de novo');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('WINDOW_CLOSED');
    expect(sent).toHaveLength(0);
  });

  it('only the platform team sees or answers conversations', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: a.owner.id, email: a.owner.email, role: 'OWNER' } });
    expect((await listAll()).status).toBe(401);
    expect((await openOne(new Request('http://x/x') as any, { params: { phone: a.key } })).status).toBe(401);
    expect((await say(a.key, 'x')).status).toBe(401);
  });

  it('SAIR stops the tips, confirms, and the queue refuses new messages', async () => {
    await inbound(' sair ');
    const stopped = await prisma.user.findUnique({ where: { id: a.owner.id } });
    expect(stopped.onboardingEmailsOptOut).toBe(true);
    expect(stopped.whatsappMarketingConsentAt).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].text.body).toContain('não vamos mais mandar dicas');
    const d = await draft('sumiu');
    expect((await approve(d.id)).status).toBe(409);
  });

  it('delivery updates the message, a late delivered does not undo read, and a failure tells the team', async () => {
    const d = await draft('sem_caixa');
    await approve(d.id);
    const row = await prisma.agentWhatsAppMessage.findFirst({ where: { agentActionId: d.id } });
    await hook({ statuses: [{ id: row.waMessageId, status: 'read' }] });
    await hook({ statuses: [{ id: row.waMessageId, status: 'delivered' }] });
    expect((await prisma.agentWhatsAppMessage.findUnique({ where: { id: row.id } })).status).toBe('read');

    await hook({ statuses: [{ id: row.waMessageId, status: 'failed', errors: [{ title: 'Número sem WhatsApp' }] }] });
    const after = await prisma.agentWhatsAppMessage.findUnique({ where: { id: row.id } });
    expect(after.status).toBe('failed');
    expect(after.error).toBe('Número sem WhatsApp');
  });

  it('a restaurant number does not enter the agent conversations', async () => {
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID = 'other-id';
    const res = await inbound('Quero pedir');
    expect(res.status).toBe(200);
    expect(await prisma.agentWhatsAppMessage.count({ where: { phone: a.key } })).toBe(0);
  });
});
