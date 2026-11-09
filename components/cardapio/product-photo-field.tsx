'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resizePhoto, PhotoDecodeError } from '@/lib/cardapio/photo-resize';

interface ProductPhotoFieldProps {
  /** null while the availability check is still loading. */
  enabled: boolean | null;
  imageUrl: string | null;
  /** With an id the photo is uploaded/removed at once; without it only previews and calls onPick. */
  menuItemId?: string;
  onChange?: (imageUrl: string | null) => void;
  onPick?: (blob: Blob | null) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function ProductPhotoField({ enabled, imageUrl, menuItemId, onChange, onPick, onBusyChange }: ProductPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  // Async work (resize/upload) can finish after unmount; never report it to a different form.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Revoke the preview object URL on change/unmount.
  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const shown = menuItemId ? imageUrl : localUrl ?? imageUrl;

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const blob = await resizePhoto(file);
      if (!mountedRef.current) return;
      if (!menuItemId) {
        setLocalUrl(URL.createObjectURL(blob));
        onPick?.(blob);
        return;
      }
      const fd = new FormData();
      fd.append('foto', blob, 'foto.jpg');
      const res = await fetch(`/api/cardapio/itens/${menuItemId}/foto`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
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
      if (mountedRef.current) setBusy(false);
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
      if (!mountedRef.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Erro ao remover a foto');
        return;
      }
      onChange?.(null);
    } catch {
      toast.error('Erro ao remover a foto');
    } finally {
      if (mountedRef.current) setBusy(false);
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
        {enabled === null ? null : enabled ? (
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
