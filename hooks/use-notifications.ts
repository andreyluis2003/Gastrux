'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

export interface Notification {
  id: string;
  userId?: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  readAt?: string;
  archived: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archiveNotification: (notificationId: string) => Promise<void>;
  archiveReadNotifications: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleMessage = useCallback((data: any) => {
    if (data.type === 'connected') {
      // Connection established
    } else if (data.type === 'unreadCount') {
      setUnreadCount(data.count);
    } else if (data.type === 'initialNotifications') {
      setNotifications(data.notifications || []);
    } else if (data.type === 'newNotification') {
      setNotifications((prev) => [data.notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    } else if (data.type === 'notificationRead') {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === data.notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } else if (data.type === 'notificationArchived') {
      setNotifications((prev) => prev.filter((n) => n.id !== data.notificationId));
    }
  }, [unreadCount]);

  // Initialize SSE connection on client side and when user is authenticated
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only initialize SSE if user is authenticated
    if (status !== 'authenticated') {
      return;
    }

    let reconnectTimeout: NodeJS.Timeout;

    const initSSE = () => {
      try {
        const eventSource = new EventSource('/api/notifications/subscribe');
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('open', () => {
          setIsConnected(true);
          setError(null);
        });

        eventSource.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            handleMessage(data);
          } catch (e) {
            // Silently ignore parse errors
          }
        });

        eventSource.addEventListener('error', (event: any) => {
          setIsConnected(false);
          // Don't retry on 401 Unauthorized (user not authenticated)
          if (eventSource.readyState === EventSource.CLOSED && event.status !== 401) {
            eventSource.close();
            reconnectTimeout = setTimeout(initSSE, 5000);
          } else {
            eventSource.close();
          }
        });
      } catch (e) {
        // Silently fail for SSE initialization errors
      }
    };

    // Only initialize if we have localStorage (indicator of being in browser)
    if (typeof localStorage !== 'undefined') {
      initSSE();
    }

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
      }
    };
  }, [handleMessage, status]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId }),
        });

        if (response.ok) {
          const result = await response.json();
          setUnreadCount(result.unreadCount);
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
            )
          );
        }
      } catch (e) {
        console.error('Error marking notification as read:', e);
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });

      if (response.ok) {
        const result = await response.json();
        setUnreadCount(result.unreadCount);
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
        );
      }
    } catch (e) {
      console.error('Error marking all as read:', e);
    }
  }, []);

  const archiveNotification = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch('/api/notifications/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId }),
        });

        if (response.ok) {
          setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        }
      } catch (e) {
        console.error('Error archiving notification:', e);
      }
    },
    []
  );

  const archiveReadNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveRead: true }),
      });

      if (response.ok) {
        setNotifications((prev) => prev.filter((n) => !n.read));
      }
    } catch (e) {
      console.error('Error archiving read notifications:', e);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/list?limit=50');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      console.error('Error refreshing notifications:', e);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isConnected,
    error,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    archiveReadNotifications,
    refresh,
  };
}
