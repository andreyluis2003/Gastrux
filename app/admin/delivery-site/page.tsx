'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Globe, Copy, ExternalLink, Loader2, CheckCircle, Bike, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function DeliverySitePage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/restaurants');
        if (res.ok) {
          const data = await res.json();
          const restaurant = Array.isArray(data) ? data[0] : data?.restaurants?.[0] || data;
          if (restaurant?.id) {
            setRestaurantId(restaurant.id);
            setRestaurantName(restaurant.name || 'Restaurante');
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const deliveryUrl = restaurantId ? `${baseUrl}/delivery/${restaurantId}` : '';

  function copyLink() {
    if (deliveryUrl) {
      navigator.clipboard.writeText(deliveryUrl);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-orange-600" /> Site Delivery
          </h1>
          <p className="text-sm text-gray-500">Link público para pedidos de delivery</p>
        </div>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-orange-100 flex items-center justify-center">
            <Bike className="h-7 w-7 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{restaurantName}</h2>
            <p className="text-sm text-gray-500">Seu cardápio online para delivery próprio</p>
          </div>
        </div>

        {restaurantId ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block flex items-center gap-1">
                <Link2 className="h-4 w-4" /> Link do Delivery
              </label>
              <div className="flex gap-2">
                <Input readOnly value={deliveryUrl} className="font-mono text-sm bg-gray-50" />
                <Button onClick={copyLink} variant="outline" className="shrink-0">
                  {copied ? <><CheckCircle className="h-4 w-4 mr-1 text-green-600" /> Copiado</> : <><Copy className="h-4 w-4 mr-1" /> Copiar</>}
                </Button>
              </div>
            </div>

            <Button asChild className="w-full bg-orange-600 hover:bg-orange-700">
              <a href={deliveryUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Abrir Site Delivery
              </a>
            </Button>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
              <h3 className="font-bold text-sm text-orange-800">Como usar</h3>
              <ul className="text-sm text-orange-700 space-y-1">
                <li>• Compartilhe este link com seus clientes via WhatsApp, Instagram ou redes sociais</li>
                <li>• Clientes acessam o cardápio, montam o pedido e pagam via PIX</li>
                <li>• Pedidos aparecem na Central de Pedidos automaticamente</li>
                <li>• Sem taxa de plataforma — você recebe 100% do valor</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Nenhum restaurante encontrado. Cadastre seu restaurante primeiro.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
