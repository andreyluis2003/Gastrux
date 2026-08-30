'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  QrCode, Download, Copy, Package, TrendingUp, Users, CheckCircle,
  Loader2, Settings, Eye, Printer, BarChart3, ArrowRight
} from 'lucide-react';

export default function QREmbalagem() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [discount, setDiscount] = useState(10);
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/qr-embalagem');
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setEnabled(d.config?.packagingQrEnabled || false);
        setDiscount(d.config?.packagingQrDiscount || 10);
        setMessage(d.config?.packagingQrMessage || '');
      }
    } catch { toast.error('Erro ao carregar dados'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/qr-embalagem', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packagingQrEnabled: enabled, packagingQrDiscount: discount, packagingQrMessage: message || null }),
      });
      if (res.ok) {
        toast.success('Configurações salvas!');
        loadData();
      } else toast.error('Erro ao salvar');
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  }

  function downloadQR() {
    if (!data?.qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `qr-embalagem-${data.config?.name || 'restaurante'}.png`;
    link.href = data.qrDataUrl;
    link.click();
  }

  function copyLink() {
    if (data?.qrUrl) {
      navigator.clipboard.writeText(data.qrUrl);
      toast.success('Link copiado!');
    }
  }

  function printSticker() {
    if (!data?.qrDataUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const discount_ = data.config?.packagingQrDiscount || 10;
    const name = data.config?.name || 'Restaurante';
    w.document.write(`
      <!DOCTYPE html>
      <html><head><title>QR Embalagem - ${name}</title>
      <style>
        @page { size: 80mm 100mm; margin: 0; }
        body { margin: 0; padding: 8mm; font-family: 'Segoe UI', sans-serif; text-align: center; }
        .sticker { border: 2px dashed #e5e5e5; border-radius: 8px; padding: 6mm; }
        .logo { font-size: 14pt; font-weight: bold; color: #ea580c; margin-bottom: 3mm; }
        .qr { width: 50mm; height: 50mm; margin: 3mm auto; }
        .qr img { width: 100%; height: 100%; }
        .msg { font-size: 11pt; font-weight: 600; color: #333; margin: 3mm 0 1mm; }
        .sub { font-size: 8pt; color: #888; }
        .discount { display: inline-block; background: #ea580c; color: white; padding: 1mm 4mm; border-radius: 4px; font-weight: bold; font-size: 13pt; margin: 2mm 0; }
      </style></head>
      <body>
        <div class="sticker">
          <div class="logo">${name}</div>
          <div class="qr"><img src="${data.qrDataUrl}" /></div>
          <div class="discount">${discount_}% OFF</div>
          <div class="msg">Peça direto e ganhe desconto!</div>
          <div class="sub">Escaneie o QR code acima</div>
        </div>
        <script>window.onload=function(){window.print();}</script>
      </body></html>
    `);
    w.document.close();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-7 h-7 text-orange-500" />
              QR Code na Embalagem
            </h1>
            <p className="text-sm text-muted-foreground">Converta clientes iFood para pedidos diretos</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Scans</p>
              <p className="text-xl font-bold">{stats.totalScans || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversões</p>
              <p className="text-xl font-bold">{stats.totalConverted || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa Conversão</p>
              <p className="text-xl font-bold">{stats.conversionRate || '0.0'}%</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
              <p className="text-xl font-bold">{stats.recentScans || 0} scans</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Preview */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-orange-500" />
            QR Code para Impressão
          </h2>
          {data?.qrDataUrl ? (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-xl border-2 border-dashed border-gray-200 inline-block">
                <img src={data.qrDataUrl} alt="QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-xs break-all">{data.qrUrl}</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <Button onClick={downloadQR} variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" /> Baixar PNG
                </Button>
                <Button onClick={copyLink} variant="outline" size="sm" className="gap-2">
                  <Copy className="w-4 h-4" /> Copiar Link
                </Button>
                <Button onClick={printSticker} size="sm" className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                  <Printer className="w-4 h-4" /> Imprimir Adesivo
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Erro ao gerar QR Code</p>
          )}
        </Card>

        {/* Config */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-500" />
            Configurações
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Ativar QR na Embalagem</p>
                <p className="text-xs text-muted-foreground">Habilita o tracking de scans</p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div>
              <label className="text-sm font-medium">Desconto (%)</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={discount}
                onChange={(e) => setDiscount(parseInt(e.target.value) || 10)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Desconto oferecido para quem escanear o QR</p>
            </div>

            <div>
              <label className="text-sm font-medium">Mensagem personalizada</label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Peça direto e ganhe ${discount}% de desconto!`}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar a mensagem padrão</p>
            </div>

            <Button onClick={saveConfig} disabled={saving} className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Salvar Configurações
            </Button>
          </div>
        </Card>
      </div>

      {/* How to use */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">📦 Como usar</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
            <div>
              <p className="font-medium text-sm">Imprima o adesivo</p>
              <p className="text-xs text-muted-foreground">Clique em "Imprimir Adesivo" e cole na embalagem de delivery</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
            <div>
              <p className="font-medium text-sm">Cliente escaneia</p>
              <p className="text-xs text-muted-foreground">Ao receber o pedido, o cliente escaneia o QR com o celular</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
            <div>
              <p className="font-medium text-sm">Pedido direto!</p>
              <p className="text-xs text-muted-foreground">O cliente acessa seu cardápio digital com desconto exclusivo</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
