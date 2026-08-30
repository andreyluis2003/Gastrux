'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { UpgradeModal } from '@/components/upgrade-modal';

interface TransactionLimitStatus {
  currentTier: string;
  dailyLimit: number;
  currentCount: number;
  remaining: number;
}

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [limitStatus, setLimitStatus] = useState<TransactionLimitStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function fetchLimitStatus() {
      try {
        const response = await fetch('/api/transaction-limit-status');
        if (response.ok) {
          const data = await response.json();
          setLimitStatus(data);

          // Show modal if user is at or near limit (Starter tier)
          if (data.currentTier === 'starter' && data.remaining <= 5) {
            setShowUpgradeModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch transaction limit status:', error);
      }
    }

    fetchLimitStatus();
    // Refresh every 60 seconds to check if limit is reached
    const interval = setInterval(fetchLimitStatus, 60000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  return (
    <>
      {children}
      {limitStatus && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentTier={limitStatus.currentTier}
          remaining={limitStatus.remaining}
          limit={limitStatus.dailyLimit}
        />
      )}
    </>
  );
}
