'use client';

import Link from 'next/link';
import { Card } from './card';
import { Button } from './button';
import { ArrowRight } from 'lucide-react';
import React from 'react';

interface ModuleCardProps {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
  color?: string;
  accentColor?: string;
  badge?: string;
  badgeColor?: string;
}

export function ModuleCard({
  title,
  description,
  href,
  icon,
  color = 'bg-blue-50',
  accentColor = 'text-blue-600',
  badge,
  badgeColor = 'bg-blue-100 text-blue-700',
}: ModuleCardProps) {
  return (
    <Link href={href}>
      <Card className={`p-6 ${color} hover:shadow-lg transition-all duration-200 cursor-pointer group border-0 h-full`}>
        <div className="flex items-start justify-between mb-4">
          {icon && <div className={`${accentColor} flex-shrink-0`}>{icon}</div>}
          {badge && <span className={`text-xs font-semibold px-2 py-1 rounded ${badgeColor}`}>{badge}</span>}
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
          {title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">{description}</p>
        <div className="flex items-center text-blue-600 dark:text-blue-400 text-sm font-medium group-hover:gap-2 transition-all gap-1">
          Acessar <ArrowRight className="w-4 h-4" />
        </div>
      </Card>
    </Link>
  );
}
