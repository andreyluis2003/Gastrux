'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href?: string;
  label?: string;
  variant?: 'ghost' | 'outline' | 'default' | 'secondary' | 'destructive';
}

export function BackButton({ 
  href = '/dashboard', 
  label = 'Voltar aos Módulos',
  variant = 'ghost' 
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };

  return (
    <button
      onClick={handleBack}
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-2 h-9 px-3 text-slate-300 ${
        variant === 'ghost'
          ? 'hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90'
      }`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
