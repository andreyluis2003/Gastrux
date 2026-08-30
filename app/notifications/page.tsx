'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Filter, Archive, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
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
};

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const { markAsRead, archiveNotification, archiveReadNotifications } = useNotifications();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchNotifications();
  }, [page]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      const response = await fetch(`/api/notifications/list?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="p-6">Carregando...</div>;
  }

  if (!session) {
    return null;
  }

  const notifications = data?.notifications || [];
  const pagination = data?.pagination || { page: 1, pages: 1, total: 0 };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Notificações</h1>
              <p className="text-sm text-slate-600">Gerencie suas notificações e alertas</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Carregando...</div>
          ) : notifications.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-500">Nenhuma notificação</p>
            </Card>
          ) : (
            <>
              {notifications.map((notification: any) => (
                <Card
                  key={notification.id}
                  className={`p-4 border-l-4 hover:shadow-md transition-all ${
                    severityColors[notification.severity as keyof typeof severityColors] || 'border-l-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-2xl">
                      {typeIcons[notification.type as keyof typeof typeIcons] || '📢'}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>

                      <p className="text-sm text-slate-700 mt-2">
                        {notification.message}
                      </p>

                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(notification.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
                    {notification.actionUrl && (
                      <Link href={notification.actionUrl}>
                        <Button variant="outline" size="sm" className="text-xs">
                          {notification.actionLabel || 'Ver Detalhes'}
                        </Button>
                      </Link>
                    )}
                    {!notification.read && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                        className="text-xs flex items-center gap-1"
                      >
                        <CheckCheck className="w-3 h-3" />
                        Marcar Lida
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => archiveNotification(notification.id)}
                      className="text-xs flex items-center gap-1 ml-auto"
                    >
                      <Archive className="w-3 h-3" />
                      Arquivar
                    </Button>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-slate-600">
              Página {pagination.page} de {pagination.pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(pagination.pages, page + 1))}
                disabled={page >= pagination.pages || loading}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
