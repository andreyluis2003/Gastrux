'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Zap } from 'lucide-react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      console.log('[UI] App is back online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[UI] App is now offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-500/90 text-white p-3 flex items-center gap-2 justify-center z-50 backdrop-blur-sm">
      <WifiOff className="w-4 h-4" />
      <span className="text-sm font-medium">No internet connection. App working offline.</span>
      <Zap className="w-4 h-4 animate-pulse" />
    </div>
  );
}
