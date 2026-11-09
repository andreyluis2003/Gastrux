/** Product photo: upload, replace, remove (spec 2026-11-09 foto-do-produto). */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
jest.mock('../../../lib/storage/photos', () => ({
  ...jest.requireActual('../../../lib/storage/photos'),
  storageConfig: jest.fn(),
  putPhoto: jest.fn(),
  deletePhoto: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { storageConfig, putPhoto, deletePhoto, MAX_PHOTO_BYTES } from '../../../lib/storage/photos';
import { POST, DELETE as DEL_PHOTO } from '../../../app/api/cardapio/itens/[id]/foto/route';
import { DELETE as DEL_ITEM } from '../../../app/api/cardapio/itens/[id]/route';
import { GET as GET_FOTOS } from '../../../app/api/cardapio/fotos/route';
import { prisma as libPrisma } from '../../../lib/prisma';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const CFG = { endpoint: 'http://s3', region: 'r', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', publicUrl: 'https://cdn.test', prefix: 'app' };
const JPEG = (n = 100) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const as = (u: any) => (getServerSession as jest.Mock).mockResolvedValue(u ? { user: { id: u.id, email: u.email } } : null);
const upload = (id: string, bytes: Uint8Array) => {
  const fd = new FormData();
  fd.append('foto', new Blob([bytes], { type: 'image/jpeg' }), 'x.jpg');
  return POST(new NextRequest(`http://localhost/api/cardapio/itens/${id}/foto`, { method: 'POST', body: fd }), { params: { id } });
};
const ctx = (id: string) => ({ params: { id } });
const req = (m: string) => new NextRequest('http://localhost/x', { method: m });

describe('product photo', () => {
  let owner, cook, rid, other, item, foreign;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `pp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `pp-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `PP ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    other = (await prisma.restaurant.create({ data: { name: `PPO ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `C ${tag}`, position: 0, active: true } });
    const oc = await prisma.menuCategory.create({ data: { restaurantId: other, name: `O ${tag}`, position: 0, active: true } });
    item = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'X', price: 10, position: 0 } });
    foreign = await prisma.menuItem.create({ data: { restaurantId: other, categoryId: oc.id, name: 'Y', price: 9, position: 0 } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    for (const id of [rid, other]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    (storageConfig as jest.Mock).mockReturnValue(CFG);
    (putPhoto as jest.Mock).mockResolvedValue(undefined);
    (deletePhoto as jest.Mock).mockResolvedValue(undefined);
    await prisma.menuItemImage.deleteMany({ where: { menuItemId: { in: [item.id, foreign.id] } } });
    as(owner);
  });

  it('owner uploads a JPEG → one image row with the public URL and the key path', async () => {
    const res = await upload(item.id, JPEG());
    expect(res.status).toBe(200);
    const body = await res.json();
    const rows = await prisma.menuItemImage.findMany({ where: { menuItemId: item.id } });
    expect(rows).toHaveLength(1);
    const key = rows[0].cloudStoragePath;
    expect(key).toMatch(new RegExp(`^app/restaurants/${rid}/menu/${item.id}/[0-9a-f-]+\\.jpg$`));
    expect(rows[0].imageUrl).toBe(`https://cdn.test/${key}`);
    expect(body).toEqual({ id: rows[0].id, imageUrl: rows[0].imageUrl });
    expect(putPhoto).toHaveBeenCalledWith(CFG, key, expect.any(Uint8Array), 'image/jpeg');
  });

  it('replacing deletes all old rows and their files', async () => {
    await prisma.menuItemImage.create({ data: { menuItemId: item.id, imageUrl: 'u1', cloudStoragePath: 'app/old1.jpg' } });
    await prisma.menuItemImage.create({ data: { menuItemId: item.id, imageUrl: 'u2', cloudStoragePath: '' } });
    expect((await upload(item.id, JPEG())).status).toBe(200);
    const rows = await prisma.menuItemImage.findMany({ where: { menuItemId: item.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].cloudStoragePath).not.toBe('app/old1.jpg');
    expect(deletePhoto).toHaveBeenCalledTimes(1);
    expect(deletePhoto).toHaveBeenCalledWith(CFG, 'app/old1.jpg');
  });

  it('remove deletes the row and the file; remove without photo → ok', async () => {
    await prisma.menuItemImage.create({ data: { menuItemId: item.id, imageUrl: 'u1', cloudStoragePath: 'app/old1.jpg' } });
    const res = await DEL_PHOTO(req('DELETE'), ctx(item.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await prisma.menuItemImage.count({ where: { menuItemId: item.id } })).toBe(0);
    expect(deletePhoto).toHaveBeenCalledWith(CFG, 'app/old1.jpg');
    expect((await DEL_PHOTO(req('DELETE'), ctx(item.id))).status).toBe(200);
  });

  it("another restaurant's product → 404, putPhoto not called", async () => {
    expect((await upload(foreign.id, JPEG())).status).toBe(404);
    expect(putPhoto).not.toHaveBeenCalled();
  });

  it('content-length above the limit → 413 before reading the body', async () => {
    const fd = new FormData();
    fd.append('foto', new Blob([JPEG()], { type: 'image/jpeg' }), 'x.jpg');
    const r = new NextRequest('http://localhost/x', { method: 'POST', body: fd, headers: { 'content-length': String(MAX_PHOTO_BYTES + 64 * 1024 + 1) } });
    const res = await POST(r, ctx(item.id));
    expect(res.status).toBe(413);
    expect(putPhoto).not.toHaveBeenCalled();
  });

  const streamed = async (bytes: Uint8Array) => {
    const fd = new FormData();
    fd.append('foto', new Blob([bytes], { type: 'image/jpeg' }), 'x.jpg');
    const r = new Response(fd);
    const raw = new Uint8Array(await r.arrayBuffer());
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < raw.length; i += 65536) c.enqueue(raw.slice(i, i + 65536));
        c.close();
      },
    });
    return new NextRequest(`http://localhost/api/cardapio/itens/${item.id}/foto`, {
      method: 'POST',
      body: stream,
      headers: { 'content-type': r.headers.get('content-type') },
      duplex: 'half',
    });
  };

  it('streamed body without content-length: over the cap → 413, small one uploads', async () => {
    const big = await POST(await streamed(JPEG(MAX_PHOTO_BYTES + 64 * 1024 + 10)), ctx(item.id));
    expect(big.status).toBe(413);
    expect(putPhoto).not.toHaveBeenCalled();
    const ok = await POST(await streamed(JPEG()), ctx(item.id));
    expect(ok.status).toBe(200);
    expect(putPhoto).toHaveBeenCalledTimes(1);
  });

  it('inactive product → 404', async () => {
    const off = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: item.categoryId, name: 'Off', price: 5, position: 2, active: false } });
    expect((await upload(off.id, JPEG())).status).toBe(404);
    expect(putPhoto).not.toHaveBeenCalled();
  });

  it('missing or string foto field → 400 with the copy', async () => {
    const copy = 'Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.';
    const empty = new FormData();
    const r1 = await POST(new NextRequest('http://localhost/x', { method: 'POST', body: empty }), ctx(item.id));
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe(copy);
    const str = new FormData();
    str.append('foto', 'not a file');
    const r2 = await POST(new NextRequest('http://localhost/x', { method: 'POST', body: str }), ctx(item.id));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe(copy);
  });

  it('DELETE photo: cook → 403, other restaurant product → 404', async () => {
    as(cook);
    expect((await DEL_PHOTO(req('DELETE'), ctx(item.id))).status).toBe(403);
    as(owner);
    expect((await DEL_PHOTO(req('DELETE'), ctx(foreign.id))).status).toBe(404);
  });

  it('cook (non-manager) → 403', async () => {
    as(cook);
    expect((await upload(item.id, JPEG())).status).toBe(403);
    expect(putPhoto).not.toHaveBeenCalled();
  });

  it('GIF bytes → 400 with the copy; 2 MB + 1 byte JPEG → 413', async () => {
    const res = await upload(item.id, GIF);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.');
    const big = await upload(item.id, JPEG(MAX_PHOTO_BYTES + 1));
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe('A foto ficou grande demais. Tente outra foto.');
    expect(putPhoto).not.toHaveBeenCalled();
  });

  it('storage not configured → 503 and GET /api/cardapio/fotos → { enabled: false }', async () => {
    (storageConfig as jest.Mock).mockReturnValue(null);
    const res = await upload(item.id, JPEG());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('Envio de fotos ainda não está disponível');
    expect(await (await GET_FOTOS()).json()).toEqual({ enabled: false });
    (storageConfig as jest.Mock).mockReturnValue(CFG);
    expect(await (await GET_FOTOS()).json()).toEqual({ enabled: true });
  });

  it('putPhoto rejects → 502, no row', async () => {
    (putPhoto as jest.Mock).mockRejectedValueOnce(new Error('s3 down'));
    const res = await upload(item.id, JPEG());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Não foi possível salvar a foto. Tente de novo.');
    expect(await prisma.menuItemImage.count({ where: { menuItemId: item.id } })).toBe(0);
  });

  it('DB failure after put → 502 and deletePhoto(newKey)', async () => {
    const spy = jest.spyOn(libPrisma, '$transaction').mockRejectedValueOnce(new Error('db'));
    const res = await upload(item.id, JPEG());
    spy.mockRestore();
    expect(res.status).toBe(502);
    const key = (putPhoto as jest.Mock).mock.calls[0][1];
    expect(deletePhoto).toHaveBeenCalledWith(CFG, key);
    expect(await prisma.menuItemImage.count({ where: { menuItemId: item.id } })).toBe(0);
  });

  it('deleting the product removes its photo row and file', async () => {
    const it2 = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: item.categoryId, name: 'Z', price: 5, position: 1 } });
    await prisma.menuItemImage.create({ data: { menuItemId: it2.id, imageUrl: 'u', cloudStoragePath: 'app/z.jpg' } });
    expect((await DEL_ITEM(req('DELETE'), ctx(it2.id))).status).toBe(200);
    expect(await prisma.menuItemImage.count({ where: { menuItemId: it2.id } })).toBe(0);
    expect(deletePhoto).toHaveBeenCalledWith(CFG, 'app/z.jpg');
  });
});
