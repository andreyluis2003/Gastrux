/** Shrinks a photo to at most 1568 px on the longer side, JPEG 0.85, and returns base64 without the data: prefix */
export async function resizeImage(file: File, max = 1568): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); ok(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => fail(r.error);
    r.readAsDataURL(file);
  });
}
