'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Bell, X, CheckCheck, Archive } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

const severityColors = {
  CRITICAL: 'bg-red-50 border-l-red-500',
  HIGH: 'bg-orange-50 border-l-orange-500',
  MEDIUM: 'bg-yellow-50 border-l-yellow-500',
  LOW: 'bg-blue-50 border-l-blue-500',
};

const typeIcons: Record<string, string> = {
  STOCK_LOW: '📦',
  STOCK_CRITICAL: '⚠️',
  ORDER_RECEIVED: '📥',
  ORDER_READY: '✅',
  PAYMENT_RECEIVED: '💰',
  PAYMENT_FAILED: '❌',
  STAFF_CLOCKED_IN: '👤',
  STAFF_ABSENT: '🚫',
  ADMIN_USER_CREATED: '👥',
  ADMIN_USER_DELETED: '🗑️',
  ADMIN_ROLE_CHANGED: '⚙️',
  SYSTEM_INFO: 'ℹ️',
  SYSTEM_ERROR: '🔴',
};

export function NotificationCenter() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { notifications, unreadCount, isConnected, markAsRead, markAllAsRead, archiveNotification } =
    useNotifications();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || status !== 'authenticated') {
    return (
      <button className="relative p-2 text-slate-700 hover:text-slate-900 transition-colors" disabled>
        <Bell className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors ${
          isOpen ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:text-slate-900'
        }`}
        aria-label={`Notificações (${unreadCount} não lidas)`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <Card className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-16px)] bg-white border border-slate-200 shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  className="h-6 px-2 text-xs"
                >
                  <CheckCheck className="w-4 h-4" />
                </Button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                Nenhuma notificação
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {notifications.slice(0, 10).map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-slate-50 transition-colors border-l-4 ${
                      severityColors[notification.severity as keyof typeof severityColors] || 'border-l-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">
                        {typeIcons[notification.type as keyof typeof typeIcons] || '📢'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-slate-900 truncate">
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1.5">
                          {new Date(notification.createdAt).toLocaleString('pt-BR')}
                        </p>

                        <div className="flex gap-2 mt-2">
                          {notification.actionUrl && (
                            <Link href={notification.actionUrl}>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                {notification.actionLabel || 'Ver'}
                              </Button>
                            </Link>
                          )}
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                              className="h-6 px-2 text-xs"
                            >
                              <CheckCheck className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => archiveNotification(notification.id)}
                            className="h-6 px-2 text-xs"
                          >
                            <Archive className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3 bg-slate-50">
              <Link href="/notifications" onClick={() => setIsOpen(false)}>
                <Button variant="ghost" className="w-full text-sm h-8">
                  Ver Todas
                </Button>
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export function useNotificationCenter() {
  return () => null; // Legacy function for compatibility
}
