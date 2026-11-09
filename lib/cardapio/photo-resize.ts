// Browser-side product photo resize: downscale to PHOTO_MAX_SIDE and re-encode as JPEG.
export const PHOTO_MAX_SIDE = 1200
export const PHOTO_QUALITY = 0.8

export class PhotoDecodeError extends Error {
  constructor(message = 'Could not decode image') {
    super(message)
    this.name = 'PhotoDecodeError'
  }
}

export function targetSize(
  width: number,
  height: number,
  maxSide: number = PHOTO_MAX_SIDE
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; dispose: () => void }

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        dispose: () => {
          if (typeof bmp.close === 'function') bmp.close()
        },
      }
    } catch {
      // fall through to the <img> fallback
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = document.createElement('img')
      el.onload = () => resolve(el)
      el.onerror = () => reject(new PhotoDecodeError())
      el.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, dispose: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function resizePhoto(file: File): Promise<Blob> {
  const decoded = await decode(file)
  try {
    if (!decoded.width || !decoded.height) throw new PhotoDecodeError()
    const { width, height } = targetSize(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new PhotoDecodeError('Canvas unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(decoded.source, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new PhotoDecodeError('Could not encode image'))),
        'image/jpeg',
        PHOTO_QUALITY
      )
    })
  } finally {
    decoded.dispose()
  }
}
