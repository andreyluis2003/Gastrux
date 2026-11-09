import { targetSize, resizePhoto, PhotoDecodeError } from '@/lib/cardapio/photo-resize'

describe('targetSize', () => {
  it('scales landscape down keeping the ratio', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1200, height: 900 })
  })
  it('scales portrait down keeping the ratio', () => {
    expect(targetSize(3000, 4000)).toEqual({ width: 900, height: 1200 })
  })
  it('never scales up', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('keeps a minimum of 1px', () => {
    expect(targetSize(1201, 1)).toEqual({ width: 1200, height: 1 })
  })
})

describe('resizePhoto', () => {
  const g = global as any
  const saved: Record<string, unknown> = {}
  const keys = ['createImageBitmap', 'document', 'Image', 'URL']

  beforeEach(() => {
    keys.forEach((k) => (saved[k] = g[k]))
  })
  afterEach(() => {
    keys.forEach((k) => {
      if (saved[k] === undefined) delete g[k]
      else g[k] = saved[k]
    })
  })

  it('rejects with PhotoDecodeError when bitmap and <img> fallback both fail', async () => {
    const revoke = jest.fn()
    g.createImageBitmap = jest.fn().mockRejectedValue(new Error('nope'))
    g.URL = { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: revoke }
    g.document = {
      createElement: (tag: string) => {
        if (tag === 'img') {
          const img: any = {}
          Object.defineProperty(img, 'src', {
            set() {
              setTimeout(() => img.onerror && img.onerror(new Error('bad')), 0)
            },
          })
          return img
        }
        return {}
      },
    }
    await expect(resizePhoto({} as File)).rejects.toBeInstanceOf(PhotoDecodeError)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
