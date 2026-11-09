'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resizePhoto, PhotoDecodeError } from '@/lib/cardapio/photo-resize';

interface ProductPhotoFieldProps {
  enabled: boolean;
  imageUrl: string | null;
  /** With an id the photo is uploaded/removed at once; without it only previews and calls onPick. */
  menuItemId?: string;
  onChange?: (imageUrl: string | null) => void;
  onPick?: (blob: Blob | null) => void;
}

export function ProductPhotoField({ enabled, imageUrl, menuItemId, onChange, onPick }: ProductPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  // Revoke the preview object URL on change/unmount.
  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  const shown = menuItemId ? imageUrl : localUrl ?? imageUrl;

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const blob = await resizePhoto(file);
      if (!menuItemId) {
        setLocalUrl(URL.createObjectURL(blob));
        onPick?.(blob);
        return;
      }
      const fd = new FormData();
      fd.append('foto', blob, 'foto.jpg');
      const res = await fetch(`/api/cardapio/itens/${menuItemId}/foto`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Erro ao enviar a foto');
        return;
      }
      onChange?.(body.imageUrl);
      toast.success('Foto salva');
    } catch (err) {
      if (err instanceof PhotoDecodeError) {
        toast.error('Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.');
      } else {
        toast.error('Erro ao enviar a foto');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!menuItemId) {
      setLocalUrl(null);
      onPick?.(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/cardapio/itens/${menuItemId}/foto`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Erro ao remover a foto');
        return;
      }
      onChange?.(null);
    } catch {
      toast.error('Erro ao remover a foto');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Foto</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted flex items-center justify-center">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Foto do produto" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-8 w-8 text-muted-foreground" />
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-xs text-white">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando…
            </div>
          )}
        </div>
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleFile(file);
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy} className="gap-2" onClick={() => inputRef.current?.click()}>
              <ImagePlus className="h-3 w-3" /> Escolher foto
            </Button>
            {shown && (
              <Button type="button" size="sm" variant="outline" disabled={busy} className="gap-2" onClick={handleRemove}>
                <Trash2 className="h-3 w-3" /> Remover
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Envio de fotos ainda não está disponível</p>
        )}
      </div>
    </div>
  );
}
