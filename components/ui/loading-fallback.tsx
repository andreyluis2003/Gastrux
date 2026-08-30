'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingFallback = ({ message = 'Carregando...' }: { message?: string }) => {
  return (
    <div className="flex items-center justify-center p-8 min-h-64">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
};

export default LoadingFallback;
