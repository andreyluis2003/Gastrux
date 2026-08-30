'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function PushNotificationManager() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if push notifications are supported
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);

    if (supported) {
      checkSubscriptionStatus();
    }
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const handleTogglePushNotifications = async () => {
    if (!isSupported) {
      toast.error('Notificações push não são suportadas neste navegador');
      return;
    }

    setIsLoading(true);

    try {
      // Check notification permission
      if (Notification.permission === 'denied') {
        toast.error(
          'Permissão negada. Habilite notificações nas configurações do navegador.'
        );
        setIsLoading(false);
        return;
      }

      // Request permission if needed
      let permission: NotificationPermission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission() as NotificationPermission;
      }

      if (permission !== 'granted') {
        toast.error('Permissão de notificação negada');
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        // Unsubscribe
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await fetch('/api/push-notifications/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          setIsSubscribed(false);
          toast.success('Notificações push desativadas');
        }
      } else {
        // Subscribe
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });

        // Send subscription to server
        await fetch('/api/push-notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        });

        setIsSubscribed(true);
        toast.success('Notificações push ativadas!');
      }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
      toast.error('Erro ao gerenciar notificações push');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleTogglePushNotifications}
      disabled={isLoading}
      className="gap-2"
      title={isSubscribed ? 'Desativar notificações' : 'Ativar notificações'}
    >
      {isSubscribed ? (
        <>
          <Bell className="h-4 w-4 fill-current" />
          <span className="hidden sm:inline">Notificações Ativas</span>
        </>
      ) : (
        <>
          <BellOff className="h-4 w-4" />
          <span className="hidden sm:inline">Ativar Notificações</span>
        </>
      )}
    </Button>
  );
}
