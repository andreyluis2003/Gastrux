import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export type StorageConfig = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicUrl: string
  prefix: string
}

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig | null {
  const get = (k: string) => (env[k] ?? '').trim()
  const endpoint = get('STORAGE_S3_ENDPOINT')
  const region = get('STORAGE_S3_REGION')
  const bucket = get('STORAGE_S3_BUCKET')
  const accessKeyId = get('STORAGE_S3_ACCESS_KEY_ID')
  const secretAccessKey = get('STORAGE_S3_SECRET_ACCESS_KEY')
  const publicUrl = get('STORAGE_PUBLIC_URL').replace(/\/+$/, '')
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) return null
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl,
    prefix: get('STORAGE_PREFIX') || 'app',
  }
}

export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const at = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (bytes.length >= 3 && at([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (bytes.length >= 8 && at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (bytes.length >= 12 && at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}

export function menuPhotoKey(
  cfg: StorageConfig,
  restaurantId: string,
  menuItemId: string,
  randomId: string,
  ext: 'jpg' | 'png' | 'webp'
): string {
  return `${cfg.prefix}/restaurants/${restaurantId}/menu/${menuItemId}/${randomId}.${ext}`
}

export function publicUrlFor(cfg: StorageConfig, key: string): string {
  return `${cfg.publicUrl}/${key.replace(/^\/+/, '')}`
}

const clients = new Map<string, S3Client>()

function clientFor(cfg: StorageConfig): S3Client {
  const id = `${cfg.endpoint}|${cfg.accessKeyId}`
  let c = clients.get(id)
  if (!c) {
    c = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: true,
    })
    clients.set(id, c)
  }
  return c
}

export async function putPhoto(
  cfg: StorageConfig,
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  await clientFor(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
}

export async function deletePhoto(cfg: StorageConfig, key: string): Promise<void> {
  try {
    await clientFor(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } catch (err) {
    console.error('[storage] delete failed:', err instanceof Error ? err.message : 'unknown error')
  }
}
