'use client';

import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>Início</span>
      </Link>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 dark:text-gray-200 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
