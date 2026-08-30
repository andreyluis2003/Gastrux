'use client';

import { useAnalytics } from '@/hooks/use-analytics';
import { useIntersectionObserver } from '@/hooks/use-intersection-observer';
import { useEffect } from 'react';

const testimonials = [
  {
    id: 1,
    name: 'João Silva',
    role: 'Proprietário, Restaurante Terra',
    content: 'Reduzimos em 40% o tempo gasto em gestão de estoque. A plataforma é intuitiva e nossos funcionários aprenderam em uma tarde.',
    rating: 5,
    image: '👨‍💼'
  },
  {
    id: 2,
    name: 'Maria Santos',
    role: 'Gerente, Pizzaria Central',
    content: 'O rastreamento de ingredientes em tempo real nos economizou milhares em desperdício. Recomendo para todos os restaurantes.',
    rating: 5,
    image: '👩‍💼'
  },
  {
    id: 3,
    name: 'Carlos Mendes',
    role: 'Chef, Cozinha Industrial',
    content: 'A integração com KDS revolucionou nosso fluxo de pedidos. Erros de pedidos caíram 90%.',
    rating: 5,
    image: '👨‍🍳'
  }
];

export function SocialProofSection() {
  const { trackEvent } = useAnalytics();
  const { elementRef, isVisible } = useIntersectionObserver();

  useEffect(() => {
    if (isVisible) {
      trackEvent('social_proof_section_view', { event_category: 'engagement' });
    }
  }, [isVisible, trackEvent]);

  return (
    <section ref={elementRef} className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            O que dizem nossos clientes
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Mais de 500 restaurantes em todo Brasil confiam em nós
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-white dark:bg-slate-900 rounded-lg p-8 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => trackEvent('testimonial_click', { testimonial_id: testimonial.id })}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="text-4xl">{testimonial.image}</div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{testimonial.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{testimonial.role}</p>
                </div>
              </div>
              
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <span key={i} className="text-yellow-400">⭐</span>
                ))}
              </div>

              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                "{testimonial.content}"
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">
            Confiado por restaurantes em todo Brasil
          </h3>
          <div className="flex flex-wrap justify-center gap-8 items-center">
            {['🍽️ Restaurante Premium', '🍕 Pizzaria Central', '🥘 Cozinha Industrial', '🍴 Bistrô Gourmet', '🥗 Saudável'].map((restaurant, i) => (
              <div
                key={i}
                className="text-sm font-medium text-slate-600 dark:text-slate-400 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg"
                onClick={() => trackEvent('client_logo_click', { client: restaurant })}
              >
                {restaurant}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
