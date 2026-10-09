// @ts-nocheck
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLabelAccess } from '@/lib/labels/access';
import { STORAGE_LABEL } from '@/lib/labels/rules';

export const dynamic = 'force-dynamic';

/** GET /api/print/labels?ids=a,b - what the printed labels carry (spec 2026-10-09 etiquetas, 5.2) */
export async function GET(req: Request) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!ids.length) return NextResponse.json({ error: 'Nenhuma etiqueta' }, { status: 400 });
  const [restaurant, labels] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { name: true, labelSize: true } }),
    prisma.foodLabel.findMany({
      where: { id: { in: ids }, restaurantId: auth.member.restaurantId },
      orderBy: { createdAt: 'asc' },
      include: { printedBy: { select: { name: true } }, batch: { select: { batchNumber: true } } },
    }),
  ]);
  // The QR code opens the label on a phone logged in to the restaurant
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  return NextResponse.json({
    size: restaurant?.labelSize || '60x40',
    restaurantName: restaurant?.name || '',
    labels: labels.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      itemType: l.itemType,
      storage: l.storage,
      storageLabel: STORAGE_LABEL[l.storage],
      preparedAt: l.preparedAt,
      expiresAt: l.expiresAt,
      quantity: l.quantity,
      unit: l.unit,
      batchNumber: l.batch?.batchNumber ?? null,
      printedBy: (l.printedBy?.name || '').split(' ')[0],
      qrUrl: `${origin.replace(/\/$/, '')}/etiquetas/${l.id}`,
    })),
  });
}
