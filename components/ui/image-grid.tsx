'use client';

import { useState } from 'react';
import { LazyImage } from './lazy-image';
import { cn } from '@/lib/utils';

interface GridItem {
  id: string;
  src: string;
  alt: string;
  title?: string;
  subtitle?: string;
}

interface ImageGridProps {
  items: GridItem[];
  columns?: number;
  gap?: number;
  onItemClick?: (item: GridItem) => void;
}

export function ImageGrid({
  items,
  columns = 3,
  gap = 4,
  onItemClick,
}: ImageGridProps) {
  const [loadedCount, setLoadedCount] = useState(0);

  return (
    <div
      className={cn(
        'grid w-full',
        {
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4': columns === 4,
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3': columns === 3,
          'grid-cols-1 sm:grid-cols-2': columns === 2,
          'grid-cols-1': columns === 1,
        }
      )}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className="cursor-pointer group"
          onClick={() => onItemClick?.(item)}
        >
          <div className="aspect-square relative overflow-hidden rounded-lg">
            <LazyImage
              src={item.src}
              alt={item.alt}
              width={300}
              height={300}
              priority={index < 6} // Priorizar primeiras 6 imagens
              className="group-hover:scale-105 transition-transform duration-300"
            />
          </div>
          {(item.title || item.subtitle) && (
            <div className="mt-2">
              {item.title && <p className="font-medium text-sm truncate">{item.title}</p>}
              {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
