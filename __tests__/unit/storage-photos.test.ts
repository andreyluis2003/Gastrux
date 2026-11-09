const send = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: class { constructor(public input: any) {} },
  DeleteObjectCommand: class { constructor(public input: any) {} },
}))

import {
  MAX_PHOTO_BYTES,
  storageConfig,
  sniffImageType,
  menuPhotoKey,
  publicUrlFor,
  putPhoto,
  deletePhoto,
  type StorageConfig,
} from '@/lib/storage/photos'

const env = {
  STORAGE_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  STORAGE_S3_REGION: 'auto',
  STORAGE_S3_BUCKET: 'bkt',
  STORAGE_S3_ACCESS_KEY_ID: 'kid',
  STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
  STORAGE_PUBLIC_URL: 'https://fotos.gastrux.com/',
} as unknown as NodeJS.ProcessEnv

const cfg = (prefix = 'app'): StorageConfig => ({
  endpoint: env.STORAGE_S3_ENDPOINT!,
  region: 'auto',
  bucket: 'bkt',
  accessKeyId: 'kid',
  secretAccessKey: 'secret',
  publicUrl: 'https://fotos.gastrux.com',
  prefix,
})

beforeEach(() => send.mockReset())

describe('storageConfig', () => {
  it('builds config, trims trailing slash, default prefix app', () => {
    const c = storageConfig(env)
    expect(c).not.toBeNull()
    expect(c!.publicUrl).toBe('https://fotos.gastrux.com')
    expect(c!.prefix).toBe('app')
    expect(c!.bucket).toBe('bkt')
  })
  it('honors STORAGE_PREFIX', () => {
    expect(storageConfig({ ...env, STORAGE_PREFIX: 'homolog' })!.prefix).toBe('homolog')
  })
  it('returns null when a var is missing or blank', () => {
    expect(storageConfig({ ...env, STORAGE_S3_BUCKET: undefined })).toBeNull()
    expect(storageConfig({ ...env, STORAGE_S3_REGION: '  ' })).toBeNull()
  })
})

describe('sniffImageType', () => {
  it('detects jpeg, png, webp', () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
    expect(sniffImageType(webp)).toBe('image/webp')
  })
  it('rejects gif and text', () => {
    expect(sniffImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('hello world!'))).toBeNull()
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
  })
})

describe('keys and urls', () => {
  it('builds menu key', () => {
    expect(menuPhotoKey(cfg('homolog'), 'r1', 'm1', 'abc', 'jpg')).toBe('homolog/restaurants/r1/menu/m1/abc.jpg')
  })
  it('joins public url with one slash', () => {
    expect(publicUrlFor(cfg(), 'a/b.jpg')).toBe('https://fotos.gastrux.com/a/b.jpg')
    expect(publicUrlFor(cfg(), '/a/b.jpg')).toBe('https://fotos.gastrux.com/a/b.jpg')
  })
  it('limits size to 2 MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024)
  })
})

describe('putPhoto / deletePhoto', () => {
  it('sends PutObject with cache headers', async () => {
    send.mockResolvedValue({})
    const bytes = Uint8Array.from([1, 2, 3])
    await putPhoto(cfg(), 'k.jpg', bytes, 'image/jpeg')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'bkt',
      Key: 'k.jpg',
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  })
  it('sends DeleteObject', async () => {
    send.mockResolvedValue({})
    await deletePhoto(cfg(), 'k.jpg')
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'bkt', Key: 'k.jpg' })
  })
  it('deletePhoto never throws', async () => {
    send.mockRejectedValue(new Error('boom'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(deletePhoto(cfg(), 'k.jpg')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
