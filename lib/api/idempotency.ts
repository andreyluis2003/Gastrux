import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

/**
 * Idempotency-Key support for the requests the offline queue may replay (market practice for POS
 * sync): the device sends the same key on every attempt, so when the first attempt reached the
 * server and only the answer was lost, the replay gets the stored answer instead of adding the item,
 * sending to the kitchen or recording the withdrawal a second time.
 *
 * - no key: the handler just runs (normal online use);
 * - known key, same method + path: the stored answer is returned (header Idempotent-Replayed: true);
 * - known key, other request: 422 (a key belongs to one request);
 * - key still running (two attempts at once): 409, the device retries later;
 * - a 5xx or a thrown error is NOT stored, so a later attempt runs again.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export async function withIdempotency(
  request: Request,
  scope: { restaurantId: string },
  handler: () => Promise<Response>
): Promise<Response> {
  const key = request.headers.get('idempotency-key');
  if (!key) return handler();
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Idempotency-Key inválida' }, { status: 400 });
  }

  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;

  let record;
  try {
    record = await prisma.idempotencyRecord.create({
      data: { restaurantId: scope.restaurantId, key, method, path },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { restaurantId_key: { restaurantId: scope.restaurantId, key } },
    });
    if (!existing) return NextResponse.json({ error: 'Tente novamente' }, { status: 409 });
    if (existing.method !== method || existing.path !== path) {
      return NextResponse.json({ error: 'Idempotency-Key já usada em outra operação' }, { status: 422 });
    }
    if (existing.statusCode === 0) {
      return NextResponse.json({ error: 'Operação ainda em processamento' }, { status: 409, headers: { 'Retry-After': '2' } });
    }
    return NextResponse.json(existing.responseBody ?? null, {
      status: existing.statusCode,
      headers: { 'Idempotent-Replayed': 'true' },
    });
  }

  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    await prisma.idempotencyRecord.delete({ where: { id: record.id } }).catch(() => null);
    throw error;
  }

  if (response.status >= 500) {
    await prisma.idempotencyRecord.delete({ where: { id: record.id } }).catch(() => null);
    return response;
  }
  const body = await response.clone().json().catch(() => null);
  await prisma.idempotencyRecord
    .update({ where: { id: record.id }, data: { statusCode: response.status, responseBody: body ?? Prisma.JsonNull } })
    .catch((error) => console.error('Could not store the idempotent answer:', error));
  return response;
}

/**
 * Wraps a route handler: with an Idempotency-Key, the key is scoped to the caller's restaurant and
 * the answer stored; without one (or with no restaurant, which the handler itself refuses) it runs
 * as usual.
 */
export function idempotent<A extends unknown[]>(handler: (request: Request, ...args: A) => Promise<Response>) {
  return async (request: Request, ...args: A): Promise<Response> => {
    if (!request.headers.get('idempotency-key')) return handler(request, ...args);
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return handler(request, ...args);
    return withIdempotency(request, { restaurantId }, () => handler(request, ...args));
  };
}
