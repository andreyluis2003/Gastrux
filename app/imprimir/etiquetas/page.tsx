'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { printWhenReady } from '@/lib/print/print-frame';

interface PrintLabel {
  id: string;
  itemName: string;
  itemType: 'RECIPE' | 'INGREDIENT';
  storageLabel: string;
  preparedAt: string;
  expiresAt: string;
  quantity: number | null;
  unit: string | null;
  batchNumber: string | null;
  printedBy: string;
  qrUrl: string;
}
interface Data { size: '60x40' | '40x25'; restaurantName: string; labels: PrintLabel[] }

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Food labels for a thermal label printer, one label per page in the restaurant's size (60x40 or
 * 40x25 mm). Opened by printInHiddenFrame with ?auto=1, prints itself when the QR codes are ready.
 */
export default function LabelsPrintPage() {
  const [data, setData] = useState<Data | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('auto') === '1';
    fetch(`/api/print/labels?ids=${encodeURIComponent(params.get('ids') || '')}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao carregar as etiquetas');
        const codes: Record<string, string> = {};
        for (const l of body.labels as PrintLabel[]) codes[l.id] = await QRCode.toDataURL(l.qrUrl, { margin: 0, width: 160 });
        setQrs(codes);
        setData(body);
        if (auto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!data) return <p className="p-4">Carregando...</p>;
  const small = data.size === '40x25';
  const [w, h] = small ? [40, 25] : [60, 40];

  return (
    <>
      <style>{`
        @page { size: ${w}mm ${h}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 1.5mm; overflow: hidden;
          page-break-after: always; break-after: page; font-family: Arial, sans-serif; color: #000; display: flex; gap: 1.5mm; }
        .label:last-child { page-break-after: auto; break-after: auto; }
        .info { flex: 1; min-width: 0; font-size: ${small ? 6.5 : 8}pt; line-height: 1.15; }
        .name { font-weight: 700; font-size: ${small ? 8 : 10}pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .exp { font-weight: 700; font-size: ${small ? 8 : 10.5}pt; margin: 0.5mm 0; }
        .qr { width: ${small ? 13 : 17}mm; height: ${small ? 13 : 17}mm; align-self: center; }
        .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
      {data.labels.map((l) => (
        <div className="label" key={l.id}>
          <div className="info">
            <div className="name">{l.itemName}</div>
            <div className="line">{l.itemType === 'RECIPE' ? 'Preparado' : 'Aberto'} em {when(l.preparedAt)}</div>
            <div className="exp">Validade: {when(l.expiresAt)}</div>
            <div className="line">{l.storageLabel}{!small && l.quantity ? ` · ${l.quantity.toLocaleString('pt-BR')} ${l.unit}` : ''}</div>
            {!small && <div className="line">Resp.: {l.printedBy}{l.batchNumber ? ` · Lote ${l.batchNumber}` : ''}</div>}
            {!small && <div className="line">{data.restaurantName}</div>}
          </div>
          {qrs[l.id] && <img className="qr" src={qrs[l.id]} alt="" />}
        </div>
      ))}
    </>
  );
}
