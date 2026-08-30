'use client';

import { useEffect, useRef, useState } from 'react';

type Metric = {
  value: string;
  label: string;
  numeric?: number;
  suffix?: string;
};

const METRICS: Metric[] = [
  { value: '500+', label: 'Donos largaram o caderno', numeric: 500, suffix: '+' },
  { value: 'R$ 3.200', label: 'Economia média/mês', numeric: 3200, suffix: '' },
  { value: '10 min', label: 'Pra começar a usar', numeric: 10, suffix: ' min' },
  { value: '4,8/5', label: 'Nota dos donos', numeric: 4.8, suffix: '/5' },
];

export function MetricStrip() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="py-10 px-4 sm:px-6 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-700"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {METRICS.map((m, i) => (
            <div
              key={i}
              className={`text-center transform transition-all duration-700 ${
                visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                {m.value}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
