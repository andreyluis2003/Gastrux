'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  containerClassName?: string;
}

export function LazyImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  containerClassName,
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(!priority);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={cn('bg-muted rounded-lg flex items-center justify-center', containerClassName)}
           style={{ width, height }}>
        <span className="text-muted-foreground text-sm">Erro ao carregar imagem</span>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden bg-muted rounded-lg', containerClassName)}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={cn(
          'object-cover transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          className
        )}
        onLoadingComplete={() => setIsLoading(false)}
        onError={() => setError(true)}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground to-muted animate-pulse" />
      )}
    </div>
  );
}
