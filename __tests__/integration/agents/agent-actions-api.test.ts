// @ts-nocheck
/**
 * The activation agent's approval queue (spec 2026-10-27): nothing reaches a client until the platform
 * team approves it. Approving an e-mail sends it with the unsubscribe link; approving a WhatsApp gives a
 * ready wa.me link; a double click sends once; an owner who asked to stop is never written to.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn() }));
import { getServerSession } from 'next-auth';
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { GET } from '../../../app/api/admin/agent-actions/route';
import { PATCH } from '../../../app/api/admin/agent-actions/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const ADMIN = { user: { id: 'admin-x', email: 'equipe@gastrux.test', role: 'ADMIN' } };

let a: any;

function patch(id: string, body: any) {
  return PATCH(new Request(`http://x/api/admin/agent-actions/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any, { params: { id } });
}

async function draft(channel: 'EMAIL' | 'WHATSAPP', trigger = `t-${crypto.randomBytes(3).toString('hex')}`) {
  return prisma.agentAction.create({
    data: { restaurantId: a.restaurant.id, userId: a.owner.id, trigger, channel, status: 'DRAFT', subject: channel === 'EMAIL' ? 'Assunto' : null, text: 'Oi, Maria!\n\nhttps://gastrux.com/vender\n\nEquipe Gastrux' },
  });
}

describe('agent actions queue', () => {
  beforeAll(async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const owner = await prisma.user.create({ data: { email: `act-q-${tag}@gastrux.test`, name: 'Maria Silva', role: 'OWNER', whatsapp: '5566999998888' } });
    const restaurant = await prisma.restaurant.create({ data: { name: `Pizzaria ${tag}`, ownerId: owner.id, status: 'TRIAL' } });
    a = { owner, restaurant };
  });

  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: a.restaurant.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: a.owner.id } }).catch(() => {});
  });

  beforeEach(async () => {
    (getServerSession as jest.Mock).mockResolvedValue(ADMIN);
    (sendTransactionalEmail as jest.Mock).mockReset().mockResolvedValue({ provider: 'resend' });
    await prisma.user.update({ where: { id: a.owner.id }, data: { onboardingEmailsOptOut: false } });
  });

  it('only the platform team sees or decides', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: a.owner.id, email: a.owner.email, role: 'OWNER' } });
    const d = await draft('EMAIL');
    expect((await GET(new Request('http://x/api/admin/agent-actions?status=DRAFT') as any)).status).toBe(401);
    expect((await patch(d.id, { action: 'approve' })).status).toBe(401);
    expect((await prisma.agentAction.findUnique({ where: { id: d.id } })).status).toBe('DRAFT');
  });

  it('lists the drafts with the account, the contact and the stage', async () => {
    const d = await draft('WHATSAPP');
    const res = await GET(new Request('http://x/api/admin/agent-actions?status=DRAFT') as any);
    expect(res.status).toBe(200);
    const row = (await res.json()).actions.find((x) => x.id === d.id);
    expect(row).toMatchObject({ restaurantName: a.restaurant.name, ownerName: 'Maria Silva', whatsapp: '5566999998888', email: a.owner.email, stage: 'SIGNED_UP' });
  });

  it('approving an e-mail sends the edited text with the unsubscribe link', async () => {
    const d = await draft('EMAIL');
    const res = await patch(d.id, { action: 'approve', text: 'Texto editado\n\nhttps://gastrux.com/vender\n\nEquipe Gastrux', subject: 'Novo assunto' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'SENT' });
    const sent = (sendTransactionalEmail as jest.Mock).mock.calls[0][0];
    expect(sent.to).toBe(a.owner.email);
    expect(sent.subject).toBe('Novo assunto');
    expect(sent.html).toContain('Texto editado');
    expect(sent.html).toContain('/api/email/unsubscribe?u=');
    const row = await prisma.agentAction.findUnique({ where: { id: d.id } });
    expect(row).toMatchObject({ status: 'SENT', decidedBy: 'equipe@gastrux.test', text: 'Texto editado\n\nhttps://gastrux.com/vender\n\nEquipe Gastrux', subject: 'Novo assunto' });
    expect(row.sentAt).not.toBeNull();
  });

  // Final review I-4: a failed send went to FAILED, out of the queue for good; it now stays to try again
  it('an e-mail that fails to send goes back to the queue with the error, and a retry sends it', async () => {
    (sendTransactionalEmail as jest.Mock).mockRejectedValueOnce(new Error('Resend 500'));
    const d = await draft('EMAIL');
    const edited = 'Editado\n\nEquipe Gastrux';
    expect((await patch(d.id, { action: 'approve', text: edited })).status).toBe(502);
    const row = await prisma.agentAction.findUnique({ where: { id: d.id } });
    expect(row).toMatchObject({ status: 'DRAFT', text: edited, sentAt: null });
    expect(row.error).toContain('Resend 500');
    expect((await patch(d.id, { action: 'approve' })).status).toBe(200);
    expect(await prisma.agentAction.findUnique({ where: { id: d.id } })).toMatchObject({ status: 'SENT', error: null });
  });

  // Final review I-2: a draft that waited in the queue while the client subscribed must not go out
  it('a client who is no longer in trial is not written to', async () => {
    const d = await draft('WHATSAPP');
    await prisma.restaurant.update({ where: { id: a.restaurant.id }, data: { status: 'ACTIVE', subscriptionStatus: 'active' } });
    try {
      const res = await patch(d.id, { action: 'approve' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('O cliente não está mais em teste');
      expect((await prisma.agentAction.findUnique({ where: { id: d.id } })).status).toBe('DRAFT');
    } finally {
      await prisma.restaurant.update({ where: { id: a.restaurant.id }, data: { status: 'TRIAL', subscriptionStatus: 'trialing' } });
    }
  });

  it('approving a WhatsApp gives the wa.me link with the text', async () => {
    const d = await draft('WHATSAPP');
    const res = await patch(d.id, { action: 'approve' });
    expect(res.status).toBe(200);
    expect((await res.json()).waUrl).toBe('https://wa.me/5566999998888?text=' + encodeURIComponent(d.text));
    expect((await prisma.agentAction.findUnique({ where: { id: d.id } })).status).toBe('SENT');
  });

  it('a double click sends once', async () => {
    const d = await draft('EMAIL');
    const [r1, r2] = await Promise.all([patch(d.id, { action: 'approve' }), patch(d.id, { action: 'approve' })]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('a decided message cannot be approved again', async () => {
    const d = await draft('WHATSAPP');
    await patch(d.id, { action: 'discard' });
    expect((await patch(d.id, { action: 'approve' })).status).toBe(409);
  });

  it('an owner who asked to stop after the draft is never written to', async () => {
    const d = await draft('EMAIL');
    await prisma.user.update({ where: { id: a.owner.id }, data: { onboardingEmailsOptOut: true } });
    const res = await patch(d.id, { action: 'approve' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('O cliente pediu para parar as mensagens');
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect((await prisma.agentAction.findUnique({ where: { id: d.id } })).status).toBe('DRAFT');
  });

  it('discarding marks it DISCARDED', async () => {
    const d = await draft('WHATSAPP');
    const res = await patch(d.id, { action: 'discard' });
    expect(await res.json()).toEqual({ status: 'DISCARDED' });
    expect(await prisma.agentAction.findUnique({ where: { id: d.id } })).toMatchObject({ status: 'DISCARDED', decidedBy: 'equipe@gastrux.test' });
  });
});
