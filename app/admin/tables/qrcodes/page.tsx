// FASE 50: QR codes page - view, print, and manage QR codes for all tables
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Printer, Download, RefreshCw, QrCode, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';

interface Table {
  id: string;
  number: number;
  qrToken: string | null;
  section: { name: string };
  capacity: number;
}

export default function QRCodesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/tables');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const list: Table[] = data.tables || [];

      // Backfill QR tokens for tables that don't have one
      const missing = list.filter((t) => !t.qrToken);
      if (missing.length > 0) {
        await fetch('/api/admin/tables/backfill-qr', { method: 'POST' });
        const res2 = await fetch('/api/admin/tables');
        const data2 = await res2.json();
        setTables(data2.tables || []);
        await generateAll(data2.tables || []);
      } else {
        setTables(list);
        await generateAll(list);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar mesas');
    } finally {
      setLoading(false);
    }
  };

  const generateAll = async (list: Table[]) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const imgs: Record<string, string> = {};
    for (const t of list) {
      if (!t.qrToken) continue;
      try {
        const url = `${origin}/menu/${t.qrToken}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 320,
          margin: 2,
          color: { dark: '#1a1a1a', light: '#ffffff' },
        });
        imgs[t.id] = dataUrl;
      } catch (e) {
        console.error('QR gen error', e);
      }
    }
    setQrImages(imgs);
  };

  const handleRegenerate = async (tableId: string) => {
    if (!confirm('Regenerar QR Code invalidará o atual. Continuar?')) return;
    try {
      setRegenerating(tableId);
      const res = await fetch(`/api/admin/tables/${tableId}/qrcode`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      toast.success('QR Code regenerado');
      await fetchTables();
    } catch (err) {
      toast.error('Erro ao regenerar');
    } finally {
      setRegenerating(null);
    }
  };

  const handleDownload = (table: Table) => {
    const img = qrImages[table.id];
    if (!img) return;
    const link = document.createElement('a');
    link.href = img;
    link.download = `qrcode-mesa-${table.number}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintAll = () => {
    window.print();
  };

  if (status === 'loading' || loading) {
    return <div className="p-8 text-center">Gerando QR Codes...</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header - hidden on print */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
              <QrCode className="w-7 h-7 text-amber-600" />
              QR Codes das Mesas
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Clientes escaneiam o QR para ver o cardápio e fazer pedidos direto da mesa.
          </p>
        </div>
        <Button onClick={handlePrintAll} className="gap-2">
          <Printer className="w-4 h-4" /> Imprimir Todos
        </Button>
      </div>

      {tables.length === 0 ? (
        <Card className="p-10 text-center text-gray-500 print:hidden">
          <QrCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="mb-3">Nenhuma mesa cadastrada ainda</p>
          <Button onClick={() => router.push('/admin/tables')}>Cadastrar mesa</Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {tables.map((table) => (
            <Card
              key={table.id}
              className="p-4 flex flex-col items-center text-center break-inside-avoid print:border-2 print:border-black print:shadow-none print:p-6"
            >
              <div className="mb-3 print:mb-2">
                <h2 className="text-2xl font-bold">Mesa {table.number}</h2>
                <p className="text-xs text-gray-600">{table.section.name}</p>
              </div>

              {qrImages[table.id] ? (
                <div className="bg-white p-3 rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImages[table.id]}
                    alt={`QR Mesa ${table.number}`}
                    className="w-48 h-48"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-gray-100 flex items-center justify-center rounded">
                  <QrCode className="w-12 h-12 text-gray-300" />
                </div>
              )}

              <div className="mt-3 text-center">
                <p className="text-sm font-semibold">Escaneie e peça!</p>
                <p className="text-xs text-gray-500 mt-1">
                  Veja o cardápio direto da mesa
                </p>
              </div>

              {/* Actions - hidden on print */}
              <div className="flex flex-wrap gap-2 mt-4 justify-center print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(table)}
                  disabled={!qrImages[table.id]}
                  className="gap-1"
                >
                  <Download className="w-3 h-3" /> PNG
                </Button>
                {table.qrToken && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="gap-1"
                  >
                    <a
                      href={`${baseUrl}/menu/${table.qrToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3 h-3" /> Abrir
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRegenerate(table.id)}
                  disabled={regenerating === table.id}
                  className="gap-1 text-amber-700"
                >
                  <RefreshCw className={`w-3 h-3 ${regenerating === table.id ? 'animate-spin' : ''}`} />
                  Regenerar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          nav, aside, header, footer, .print\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
