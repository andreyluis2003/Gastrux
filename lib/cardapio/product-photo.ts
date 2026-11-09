import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  MAX_PHOTO_BYTES,
  deletePhoto,
  menuPhotoKey,
  publicUrlFor,
  putPhoto,
  sniffImageType,
  storageConfig,
} from '@/lib/storage/photos';

export type PhotoErrorCode = 'disabled' | 'not_found' | 'bad_type' | 'too_big' | 'storage';

export class PhotoError extends Error {
  code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) {
    super(code);
    this.name = 'PhotoError';
    this.code = code;
  }
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Stores a new photo for the product, replacing (and deleting) any previous one. */
export async function setProductPhoto(
  restaurantId: string,
  menuItemId: string,
  bytes: Uint8Array
): Promise<{ id: string; imageUrl: string }> {
  const cfg = storageConfig();
  if (!cfg) throw new PhotoError('disabled');

  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId, active: true }, select: { id: true } });
  if (!item) throw new PhotoError('not_found');

  const type = sniffImageType(bytes);
  if (!type) throw new PhotoError('bad_type');
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError('too_big');

  const key = menuPhotoKey(cfg, restaurantId, menuItemId, crypto.randomUUID(), EXT[type]);
  try {
    await putPhoto(cfg, key, bytes, type);
  } catch (err) {
    console.error('[cardapio] photo upload failed:', err instanceof Error ? err.message : 'unknown error');
    throw new PhotoError('storage');
  }

  const imageUrl = publicUrlFor(cfg, key);
  let created: { id: string };
  let oldPaths: string[];
  try {
    const old = await prisma.menuItemImage.findMany({ where: { menuItemId }, select: { cloudStoragePath: true } });
    oldPaths = old.map((o) => o.cloudStoragePath);
    const [, row] = await prisma.$transaction([
      prisma.menuItemImage.deleteMany({ where: { menuItemId } }),
      prisma.menuItemImage.create({
        data: { menuItemId, imageUrl, cloudStoragePath: key, isPublic: true },
        select: { id: true },
      }),
    ]);
    created = row;
  } catch (err) {
    console.error('[cardapio] photo save failed:', err instanceof Error ? err.message : 'unknown error');
    await deletePhoto(cfg, key);
    throw new PhotoError('storage');
  }

  for (const path of oldPaths) {
    if (path) await deletePhoto(cfg, path);
  }
  return { id: created.id, imageUrl };
}

/** Removes the product's photo rows and their files. No photo is fine. */
export async function removeProductPhoto(restaurantId: string, menuItemId: string): Promise<void> {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId }, select: { id: true } });
  if (!item) throw new PhotoError('not_found');
  const rows = await prisma.menuItemImage.findMany({ where: { menuItemId }, select: { cloudStoragePath: true } });
  await prisma.menuItemImage.deleteMany({ where: { menuItemId } });
  const cfg = storageConfig();
  if (!cfg) return;
  for (const r of rows) {
    if (r.cloudStoragePath) await deletePhoto(cfg, r.cloudStoragePath);
  }
}
