'use client';

import { useEffect, useState } from 'react';
import { Gift, ShoppingBag, ArrowRight, Star, Percent, Clock, Heart } from 'lucide-react';
import Link from 'next/link';

interface Props {
  restaurant: {
    id: string;
    name: string;
    logoUrl: string | null;
    packagingQrEnabled: boolean;
    packagingQrDiscount: number;
    packagingQrMessage: string | null;
  };
  source: string;
}

export default function DirectOrderLanding({ restaurant, source }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const discount = restaurant.packagingQrDiscount || 10;
  const customMessage = restaurant.packagingQrMessage || `Peça direto e ganhe ${discount}% de desconto!`;
  const deliveryUrl = `/delivery/${restaurant.id}?src=${source}&discount=${discount}`;

  const benefits = [
    { icon: Percent, title: `${discount}% de desconto`, desc: 'No seu primeiro pedido direto' },
    { icon: Clock, title: 'Entrega mais rápida', desc: 'Sem intermediários no caminho' },
    { icon: Heart, title: 'Atendimento direto', desc: 'Fale diretamente com o restaurante' },
    { icon: Star, title: 'Programa de fidelidade', desc: 'Acumule pontos a cada pedido' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-red-600 opacity-95" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M54.627%200l.83.828-1.415%201.415L51.8%200h2.827zM5.373%200l-.83.828L5.96%202.243%208.2%200H5.374zM48.97%200l3.657%203.657-1.414%201.414L46.143%200h2.828zM11.03%200L7.372%203.657%208.787%205.07%2013.857%200H11.03zM17.656%200l-7.07%207.07%201.413%201.415L20.485%200h-2.83zM24.284%200L13.87%2010.414l1.415%201.413L26.698%200h-2.414zM0%205.373l.828-.83%201.415%201.414L0%208.2V5.374zm0%205.656l.828-.829%205.485%205.486-1.414%201.414L0%2011.03V11.03zm0%205.657l.828-.828%209.142%209.142-1.414%201.414L0%2016.686V16.686zM0%2022.343l.828-.828%2012.8%2012.8-1.414%201.414L0%2022.343V22.343zM0%2028l.828-.828L16.457%2042.8l-1.414%201.414L0%2028zm0%205.657l.828-.828%2019.799%2019.8-1.414%201.413L0%2033.657zM0%2039.313l.828-.828L24.456%2062.113l-1.414%201.414L0%2039.313zm0%205.657l.828-.828L29.113%2072.427l-1.414%201.414L0%2044.97z%22%20fill%3D%22%23fff%22%20fill-opacity%3D%22.05%22%20fill-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] opacity-30" />
        <div className="relative px-4 py-12 md:py-16 text-center">
          {restaurant.logoUrl && (
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden">
              <img src={restaurant.logoUrl} alt={restaurant.name} className="w-16 h-16 object-contain rounded-full" />
            </div>
          )}
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            {restaurant.name}
          </h1>
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-5 py-2 mb-6">
            <Gift className="w-5 h-5 text-yellow-300" />
            <span className="text-white font-semibold text-lg">{customMessage}</span>
          </div>
          <p className="text-white/90 text-base max-w-md mx-auto">
            Peça diretamente pelo nosso cardápio digital e aproveite vantagens exclusivas!
          </p>
        </div>
      </div>

      {/* Benefits */}
      <div className="px-4 -mt-6 relative z-10 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-800 text-center">Por que pedir direto?</h2>
          <div className="grid grid-cols-2 gap-3">
            {benefits.map((b, i) => (
              <div key={i} className="flex flex-col items-center text-center p-3 rounded-xl bg-orange-50">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mb-2">
                  <b.icon className="w-5 h-5 text-orange-600" />
                </div>
                <span className="text-sm font-semibold text-gray-800">{b.title}</span>
                <span className="text-xs text-gray-500 mt-0.5">{b.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 py-8 max-w-lg mx-auto">
        <Link
          href={deliveryUrl}
          className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-lg py-4 px-8 rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <ShoppingBag className="w-6 h-6" />
          Ver Cardápio e Pedir
          <ArrowRight className="w-5 h-5" />
        </Link>
        <p className="text-center text-sm text-gray-500 mt-3">
          * Desconto aplicado automaticamente no primeiro pedido direto
        </p>
      </div>

      {/* Trust badges */}
      <div className="px-4 pb-8 max-w-lg mx-auto">
        <div className="flex items-center justify-center gap-6 text-gray-400 text-xs">
          <span>🔒 Pagamento seguro</span>
          <span>🚀 Entrega rápida</span>
          <span>⭐ Qualidade garantida</span>
        </div>
      </div>
    </div>
  );
}
